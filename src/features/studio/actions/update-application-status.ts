"use server"

import { revalidatePath } from "next/cache"

import { sendParentNotificationSafely } from "@/features/notifications/alimtalk/send-parent-notification"
import { sendStudioNotificationSafely } from "@/features/notifications/sms/send-studio-notification"
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
    allowedCurrentStatuses: ["new", "reviewing"]
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
  reviewing: "확인 중",
  confirmed: "확정",
  completed: "완료",
  canceled: "취소"
}

const logSafeStatusActionError = (
  scope: string,
  error: unknown,
  payload: Record<string, unknown>
) => {
  const message = error instanceof Error ? error.message : "unknown_error"
  const code =
    typeof error === "object" && error && "code" in error && typeof error.code === "string"
      ? error.code
      : null
  const details =
    typeof error === "object" && error && "details" in error && typeof error.details === "string"
      ? error.details
      : null
  const hint =
    typeof error === "object" && error && "hint" in error && typeof error.hint === "string"
      ? error.hint
      : null

  console.error(`[studio application status] ${scope}`, {
    message,
    code,
    details,
    hint,
    payload
  })
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
        await sendParentNotificationSafely({
          eventType: "trial_schedule_confirmed",
          organizationId: teacher.organizationId,
          trialApplicationId: updated.id,
          createdBy: teacher.id,
          parentId: updated.parentId,
          parentPhone: updated.parentPhone,
          parentName: updated.parentName,
          studentName: updated.childName,
          academyName: updated.academyName,
          classId: updated.classId,
          classTitle: updated.classTitle,
          requestedSlotAt: updated.requestedSlotAt,
          confirmedSlotAt: updated.confirmedSlotAt,
          selectedScheduleLabel: updated.selectedScheduleLabel ?? null
        })
        await sendStudioNotificationSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          teacherEventType: "teacher_trial_schedule_confirmed",
          adminEventType: "admin_trial_schedule_confirmed"
        })
      }

      if (requestedActionType === "move_to_completed") {
        await sendParentNotificationSafely({
          eventType: "trial_completed",
          organizationId: teacher.organizationId,
          trialApplicationId: updated.id,
          createdBy: teacher.id,
          parentId: updated.parentId,
          parentPhone: updated.parentPhone,
          parentName: updated.parentName,
          studentName: updated.childName,
          academyName: updated.academyName,
          classId: updated.classId,
          classTitle: updated.classTitle,
          requestedSlotAt: updated.requestedSlotAt,
          confirmedSlotAt: updated.confirmedSlotAt,
          selectedScheduleLabel: updated.selectedScheduleLabel ?? null
        })
      }

      if (requestedActionType === "cancel") {
        await sendParentNotificationSafely({
          eventType: "trial_rejected",
          organizationId: teacher.organizationId,
          trialApplicationId: updated.id,
          createdBy: teacher.id,
          parentId: updated.parentId,
          parentPhone: updated.parentPhone,
          parentName: updated.parentName,
          studentName: updated.childName,
          academyName: updated.academyName,
          classId: updated.classId,
          classTitle: updated.classTitle,
          requestedSlotAt: updated.requestedSlotAt,
          confirmedSlotAt: updated.confirmedSlotAt,
          selectedScheduleLabel: updated.selectedScheduleLabel ?? null
        })
        await sendStudioNotificationSafely({
          organizationId: teacher.organizationId,
          application: updated,
          createdBy: teacher.id,
          teacherEventType: "teacher_trial_canceled",
          adminEventType: "admin_trial_canceled"
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
    logSafeStatusActionError("update_failed", error, {
      applicationId,
      actionType: requestedActionType,
      actorId: teacher.id,
      organizationId: teacher.organizationId
    })

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
