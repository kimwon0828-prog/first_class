"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { dataAdapter } from "@/shared/lib/db"
import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

export type UpdateApplicationOutcomeActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: UpdateApplicationOutcomeActionState = {
  status: "idle",
  message: ""
}

const REGISTRATION_STATUSES: ApplicationRegistrationStatus[] = [
  "undecided",
  "enrolled",
  "not_enrolled",
  "pending"
]

const UNREGISTERED_REASONS: ApplicationUnregisteredReason[] = [
  "schedule_mismatch",
  "cost_burden",
  "distance",
  "child_reaction",
  "comparing_other_academies",
  "no_response",
  "other"
]

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : null
}

const getChangedFieldLabels = (
  current: StudioApplicationDetail,
  nextValue: {
    consultationNote: string | null
    trialFeedback: string | null
    registeredCourse: string | null
    finalLevel: string | null
    finalSchedule: string | null
    followUpNote: string | null
    registrationStatus: ApplicationRegistrationStatus
    unregisteredReason: ApplicationUnregisteredReason | null
  }
) => {
  const changes: string[] = []

  if (current.consultationNote !== nextValue.consultationNote) {
    changes.push("상담 메모")
  }

  if (current.trialFeedback !== nextValue.trialFeedback) {
    changes.push("체험/레벨테스트 결과 메모")
  }

  if (current.registeredCourse !== nextValue.registeredCourse) {
    changes.push("추천 과정")
  }

  if (current.finalLevel !== nextValue.finalLevel) {
    changes.push("확정 레벨")
  }

  if (current.finalSchedule !== nextValue.finalSchedule) {
    changes.push("확정 수업 시간")
  }

  if (current.followUpNote !== nextValue.followUpNote) {
    changes.push("후속 조치 메모")
  }

  if (current.registrationStatus !== nextValue.registrationStatus) {
    changes.push("등록 상태")
  }

  if (current.unregisteredReason !== nextValue.unregisteredReason) {
    changes.push("미등록 사유")
  }

  return changes
}

export async function updateApplicationOutcomeAction(
  applicationId: string,
  previousState: UpdateApplicationOutcomeActionState = defaultState,
  formData: FormData
): Promise<UpdateApplicationOutcomeActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  const registrationStatusValue = formData.get("registrationStatus")
  const unregisteredReasonValue = formData.get("unregisteredReason")

  if (
    typeof registrationStatusValue !== "string" ||
    !REGISTRATION_STATUSES.includes(registrationStatusValue as ApplicationRegistrationStatus)
  ) {
    return {
      status: "error",
      message: "등록 상태 값이 올바르지 않습니다."
    }
  }

  const registrationStatus = registrationStatusValue as ApplicationRegistrationStatus

  if (
    typeof unregisteredReasonValue === "string" &&
    unregisteredReasonValue.trim().length > 0 &&
    !UNREGISTERED_REASONS.includes(unregisteredReasonValue as ApplicationUnregisteredReason)
  ) {
    return {
      status: "error",
      message: "미등록 사유 값이 올바르지 않습니다."
    }
  }

  const unregisteredReason =
    registrationStatus === "not_enrolled"
      ? ((normalizeOptionalText(unregisteredReasonValue) as ApplicationUnregisteredReason | null) ??
          null)
      : null

  if (registrationStatus === "not_enrolled" && !unregisteredReason) {
    return {
      status: "error",
      message: "미등록 상태일 때는 미등록 사유를 선택해 주세요."
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
      message: "완료 처리된 신청에만 운영 기록을 저장할 수 있습니다."
    }
  }

  const nextValue = {
    consultationNote: normalizeOptionalText(formData.get("consultationNote")),
    trialFeedback: normalizeOptionalText(formData.get("trialFeedback")),
    registeredCourse: normalizeOptionalText(formData.get("registeredCourse")),
    finalLevel: normalizeOptionalText(formData.get("finalLevel")),
    finalSchedule: normalizeOptionalText(formData.get("finalSchedule")),
    followUpNote: normalizeOptionalText(formData.get("followUpNote")),
    registrationStatus,
    unregisteredReason
  }

  const changedFieldLabels = getChangedFieldLabels(current, nextValue)
  const logNote =
    changedFieldLabels.length > 0
      ? `운영 기록 저장: ${changedFieldLabels.join(", ")}`
      : "운영 기록 저장"

  try {
    await dataAdapter.updateStudioApplicationOutcome({
      applicationId,
      actorId: teacher.id,
      currentStatus: current.status,
      consultationNote: nextValue.consultationNote,
      trialFeedback: nextValue.trialFeedback,
      registeredCourse: nextValue.registeredCourse,
      finalLevel: nextValue.finalLevel,
      finalSchedule: nextValue.finalSchedule,
      followUpNote: nextValue.followUpNote,
      registrationStatus: nextValue.registrationStatus,
      unregisteredReason: nextValue.unregisteredReason,
      note: logNote
    })

    revalidatePath("/studio")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message: "운영 기록과 등록 전환 정보를 저장했습니다."
    }
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "failed_to_update_application_outcome"

    if (message === "application_not_found_or_forbidden") {
      return {
        status: "error",
        message: "수정 권한이 없거나 신청을 찾을 수 없습니다."
      }
    }

    if (message === "application_outcome_status_conflict") {
      return {
        status: "error",
        message: "완료 상태가 변경되었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
      }
    }

    return {
      status: "error",
      message: "운영 기록 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
