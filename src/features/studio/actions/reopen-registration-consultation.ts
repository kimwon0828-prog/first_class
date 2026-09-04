"use server"

import { revalidatePath } from "next/cache"

import { requireStudioEntitlement } from "@/features/billing/lib/require-entitlement"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

// 미등록으로 종결한 Case 의 등록 상담을 다시 연다.
//
// 체험 자체(status = completed)는 건드리지 않는다. registration 축만 되돌린다.
//   not_enrolled → pending
//
// enrolled 는 대상이 아니다. 등록 완료를 상담 상태로 되돌리는 것은
// 취소/환불이라는 다른 제품 의미라서 이 경로에서 처리하지 않는다.
//
// 실제 쓰기는 기존 updateStudioApplicationOutcome 을 그대로 쓴다.
// 새 adapter method 를 만들면 lost_at / unregistered_reason 정리 규칙이
// 두 곳으로 갈라진다.

/**
 * 현재 미등록 사유가 이력에 이미 보존되어 있는지 판정한다.
 *
 * 재개는 trial_applications 의 현재 사유를 null 로 만든다. 그 사유가 상담
 * 이력에 구조화된 형태로 남아 있지 않으면 이 순간 영구 소실된다.
 *
 * "아무 log 에나 사유 스냅샷이 하나라도 있으면 통과" 로는 부족하다.
 * 지금 종결 상태를 만든 상담이 그 사유를 담고 있어야 한다. 그래서
 * 현재 종결을 대표하는 "가장 최근 CONSULTATION" 하나만 본다.
 *
 * LEGACY_IMPORT 는 증거로 쓰지 않는다. 이관 데이터에는 등록 결정 스냅샷이 없다.
 */
const isCurrentUnregisteredReasonPreserved = (current: StudioApplicationDetail) => {
  if (!current.unregisteredReason) {
    // 구조화 사유 자체가 없으면 소실될 것도 없다.
    return true
  }

  // consultationLogs 는 occurred_at desc 다. 최신 상담 판정은 기존 idiom 을 그대로 쓴다.
  const latestConsultationLog =
    current.consultationLogs.find((item) => item.activityType === "CONSULTATION") ?? null

  if (!latestConsultationLog) {
    return false
  }

  if (latestConsultationLog.registrationStatusSnapshot !== "not_enrolled") {
    return false
  }

  if (latestConsultationLog.unregisteredReasonSnapshot !== current.unregisteredReason) {
    return false
  }

  if (current.unregisteredReason === "other") {
    return (
      latestConsultationLog.unregisteredReasonNoteSnapshot === current.unregisteredReasonNote
    )
  }

  return true
}

export type ReopenRegistrationConsultationActionState = {
  status: "idle" | "error" | "success"
  message: string
  successToken?: string | null
}

const defaultState: ReopenRegistrationConsultationActionState = {
  status: "idle",
  message: "",
  successToken: null
}

export async function reopenRegistrationConsultationAction(
  applicationId: string,
  previousState: ReopenRegistrationConsultationActionState = defaultState
): Promise<ReopenRegistrationConsultationActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  // 유료 기능이다. form 없이 action 이 직접 호출될 수 있으므로 서버에서 막는다.
  // 조회 실패는 허용하지 않는다(fail closed).
  const entitlement = await requireStudioEntitlement(teacher.organizationId, "canReopenConsultation")
  if (!entitlement.allowed) {
    return {
      status: "error",
      message: entitlement.message
    }
  }

  const { data: current, error } = await getStudioApplicationDetail(
    applicationId,
    teacher.organizationId
  )

  if (error || !current) {
    return {
      status: "error",
      message: "조회 가능한 신청이 아니거나 신청 정보를 불러오지 못했습니다."
    }
  }

  if (current.status !== "completed") {
    return {
      status: "error",
      message: "체험 완료 이후에만 등록 상담을 다시 시작할 수 있습니다."
    }
  }

  if (current.registrationStatus !== "not_enrolled") {
    return {
      status: "error",
      message: "미등록으로 종결한 신청만 상담을 다시 시작할 수 있습니다."
    }
  }

  if (!isCurrentUnregisteredReasonPreserved(current)) {
    return {
      status: "error",
      // 원장이 스스로 해결할 방법이 없는 상태다. 할 수 없는 행동을 안내하지 않는다.
      message:
        "이 신청은 이전 방식으로 저장된 기록이라 바로 상담을 재개할 수 없습니다. 관리자 확인이 필요합니다."
    }
  }

  try {
    // registration_status 를 pending 으로 되돌리면 기존 outcome 계약에 따라
    // lost_at / unregistered_reason / unregistered_reason_note 가 정리된다.
    // completed_at, 희망 일정, 체험 결과는 이 UPDATE 의 대상이 아니라 그대로 남는다.
    await dataAdapter.updateStudioApplicationOutcome({
      applicationId,
      actorId: teacher.id,
      currentStatus: current.status,
      previousRegistrationStatus: current.registrationStatus,
      previousLostAt: current.lostAt,
      consultationNote: current.consultationNote,
      trialFeedback: current.trialFeedback,
      registeredCourse: current.registeredCourse,
      finalLevel: current.finalLevel,
      finalSchedule: current.finalSchedule,
      followUpNote: current.followUpNote,
      registrationStatus: "pending",
      unregisteredReason: null,
      unregisteredReasonNote: null,
      note: "등록 상담을 다시 시작했습니다."
    })

    revalidatePath("/studio")
    revalidatePath("/studio/cases")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message: "등록 상담을 다시 시작했습니다.",
      successToken: crypto.randomUUID()
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "failed_to_reopen_registration_consultation"

    if (message === "application_outcome_status_conflict") {
      return {
        status: "error",
        message: "신청 상태가 방금 변경되었습니다. 새로고침 후 다시 시도해 주세요."
      }
    }

    if (message === "application_not_found_or_forbidden") {
      return {
        status: "error",
        message: "수정 권한이 없거나 신청을 찾을 수 없습니다."
      }
    }

    return {
      status: "error",
      message: "등록 상담을 다시 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
