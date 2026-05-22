"use server"

import { revalidatePath } from "next/cache"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

export type UpdateApplicationStatusActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: ""
}

const STATUS_TRANSITIONS: Partial<Record<ApplicationStatus, ApplicationStatus>> = {
  new: "reviewing",
  reviewing: "confirmed",
  confirmed: "completed"
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "신규",
  reviewing: "검토 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

const STATUS_NOTES: Record<ApplicationStatus, string> = {
  new: "신청이 신규 상태로 등록되었습니다.",
  reviewing: "teacher가 신청 검토를 시작했습니다.",
  confirmed: "teacher가 체험 신청을 확정했습니다.",
  completed: "teacher가 체험 진행 완료 처리했습니다.",
  canceled: "teacher가 신청을 취소 처리했습니다."
}

export async function updateApplicationStatusAction(
  applicationId: string,
  requestedNextStatus: ApplicationStatus,
  previousState: UpdateApplicationStatusActionState = defaultState
): Promise<UpdateApplicationStatusActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()

  try {
    const current = await dataAdapter.getStudioApplicationDetail(
      applicationId,
      teacher.organizationId
    )

    if (!current) {
      return {
        status: "error",
        message: "조회 가능한 신청이 아니거나 이미 처리된 상태입니다."
      }
    }

    const allowedNextStatus = STATUS_TRANSITIONS[current.status]
    if (!allowedNextStatus) {
      return {
        status: "error",
        message: "현재 상태에서는 더 이상 변경할 수 없습니다."
      }
    }

    if (allowedNextStatus !== requestedNextStatus) {
      return {
        status: "error",
        message: "허용되지 않은 상태 전이입니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
      }
    }

    await dataAdapter.updateStudioApplicationStatus({
      applicationId,
      currentStatus: current.status,
      nextStatus: requestedNextStatus,
      actorId: teacher.id,
      note: STATUS_NOTES[requestedNextStatus]
    })

    revalidatePath("/studio")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)

    return {
      status: "success",
      message: `신청 상태를 ${STATUS_LABELS[requestedNextStatus]}(으)로 변경했습니다.`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_update_application_status"

    if (message === "application_status_conflict") {
      return {
        status: "error",
        message: "다른 작업으로 상태가 먼저 변경되었습니다. 화면을 새로고침해 주세요."
      }
    }

    if (message === "missing_requested_schedule_block") {
      return {
        status: "error",
        message:
          "예약 시간 정보가 없어 확정 처리할 수 없습니다. 신청 시간 정보를 확인해 주세요."
      }
    }

    return {
      status: "error",
      message: "상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
