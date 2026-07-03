"use server"

import { revalidatePath } from "next/cache"

import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { dataAdapter } from "@/shared/lib/db"
import type { ApplicationStatus, ApplicationStatusActionType } from "@/shared/lib/db/adapter"

export type UpdateApplicationStatusActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: ""
}

const ACTION_CONFIG: Record<
  ApplicationStatusActionType,
  {
    label: string
    note: string
    nextStatus: ApplicationStatus
    allowedCurrentStatuses: ApplicationStatus[]
  }
> = {
  move_to_reviewing: {
    label: "상담/확인 중",
    note: "teacher가 신청을 상담/확인 중 상태로 변경했습니다.",
    nextStatus: "reviewing",
    allowedCurrentStatuses: ["new"]
  },
  move_to_confirmed: {
    label: "일정 확정",
    note: "teacher가 체험 신청 일정을 확정했습니다.",
    nextStatus: "confirmed",
    allowedCurrentStatuses: ["reviewing"]
  },
  move_to_completed: {
    label: "체험 완료",
    note: "teacher가 체험 진행 완료 처리했습니다.",
    nextStatus: "completed",
    allowedCurrentStatuses: ["confirmed"]
  },
  cancel: {
    label: "취소",
    note: "teacher가 신청을 취소 처리했습니다.",
    nextStatus: "canceled",
    allowedCurrentStatuses: ["new", "reviewing", "confirmed"]
  },
  no_show: {
    label: "노쇼",
    note: "teacher가 신청을 노쇼 처리했습니다.",
    nextStatus: "canceled",
    allowedCurrentStatuses: ["confirmed"]
  }
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "신규",
  reviewing: "상담/확인 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

export async function updateApplicationStatusAction(
  applicationId: string,
  previousState: UpdateApplicationStatusActionState = defaultState,
  formData: FormData
): Promise<UpdateApplicationStatusActionState> {
  void previousState

  const teacher = await requireTeacherStudioAccess()
  const requestedActionValue = formData.get("actionType")

  if (typeof requestedActionValue !== "string" || !(requestedActionValue in ACTION_CONFIG)) {
    return {
      status: "error",
      message: "허용되지 않은 상태 변경 요청입니다."
    }
  }

  const requestedActionType = requestedActionValue as ApplicationStatusActionType
  const requestedActionConfig = ACTION_CONFIG[requestedActionType]

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

    if (!requestedActionConfig.allowedCurrentStatuses.includes(current.status)) {
      return {
        status: "error",
        message: "현재 상태에서는 요청한 처리를 진행할 수 없습니다. 화면을 새로고침한 뒤 다시 시도해 주세요."
      }
    }

    await dataAdapter.updateStudioApplicationStatus({
      applicationId,
      currentStatus: current.status,
      actionType: requestedActionType,
      nextStatus: requestedActionConfig.nextStatus,
      actorId: teacher.id,
      note: requestedActionConfig.note
    })

    const updated = await dataAdapter
      .getStudioApplicationDetail(applicationId, teacher.organizationId)
      .catch(() => null)

    if (updated) {
      if (requestedActionType === "move_to_confirmed") {
        await logSmsEventSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          recipientType: "parent",
          eventType: "trial_schedule_confirmed"
        })
        await logSmsEventSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          recipientType: "teacher",
          eventType: "teacher_trial_schedule_confirmed"
        })
      }

      if (requestedActionType === "move_to_completed") {
        await logSmsEventSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          recipientType: "parent",
          eventType: "trial_completed"
        })
      }

      if (requestedActionType === "cancel") {
        await logSmsEventSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          recipientType: "teacher",
          eventType: "teacher_trial_canceled"
        })
      }
    }

    revalidatePath("/studio")
    revalidatePath("/studio/applications")
    revalidatePath(`/studio/applications/${applicationId}`)
    revalidatePath("/studio/schedule")

    return {
      status: "success",
      message:
        requestedActionType === "no_show"
          ? "신청을 노쇼로 처리했습니다."
          : `신청 상태를 ${STATUS_LABELS[requestedActionConfig.nextStatus]}(으)로 변경했습니다.`
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

    if (message === "missing_class_teacher_for_confirmation") {
      return {
        status: "error",
        message:
          "담당 선생님 정보가 없어 일정을 확정할 수 없습니다. 수업 담당 선생님을 먼저 지정해주세요."
      }
    }

    if (message === "failed_to_prepare_application_status_update") {
      return {
        status: "error",
        message: "상태 변경 준비 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
      }
    }

    return {
      status: "error",
      message: "상태 변경에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
