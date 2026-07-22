import "server-only"

import { sendAlimtalk } from "@/features/notifications/alimtalk/send-alimtalk"
import type { ParentNotificationContext, ParentNotificationResult } from "@/features/notifications/alimtalk/types"
import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"

const shouldFallbackToSms = (status: ParentNotificationResult["alimtalk"]["status"]) =>
  status === "disabled" || status === "failed" || status === "skipped"

const resolveSafeNotificationError = (error: unknown) => ({
  message: error instanceof Error ? error.message : "unknown_error",
  code:
    typeof error === "object" && error && "code" in error && typeof error.code === "string"
      ? error.code
      : null,
  details:
    typeof error === "object" && error && "details" in error && typeof error.details === "string"
      ? error.details
      : null,
  hint:
    typeof error === "object" && error && "hint" in error && typeof error.hint === "string"
      ? error.hint
      : null
})

export const sendParentNotification = async (
  context: ParentNotificationContext
): Promise<ParentNotificationResult> => {
  const alimtalk = await sendAlimtalk(context)

  if (!shouldFallbackToSms(alimtalk.status)) {
    console.info("[parent notification] delivered via alimtalk", {
      eventType: context.eventType,
      trialApplicationId: context.trialApplicationId,
      providerMessageId: alimtalk.providerMessageId
    })

    return {
      channel: "alimtalk",
      alimtalk
    }
  }

  await logSmsEventSafely({
    organizationId: context.organizationId,
    application: {
      id: context.trialApplicationId,
      academyName: context.academyName,
      classId: context.classId,
      parentId: context.parentId,
      childName: context.studentName ?? "",
      parentName: context.parentName,
      parentPhone: context.parentPhone,
      classTitle: context.classTitle,
      requestedSlotAt: context.requestedSlotAt ?? "",
      confirmedSlotAt: context.confirmedSlotAt,
      selectedScheduleLabel: context.selectedScheduleLabel,
      assignedTeacherId: null,
      assignedTeacherName: null
    },
    createdBy: context.createdBy ?? null,
    recipientType: "parent",
    eventType: context.eventType
  })

  console.info("[parent notification] fell back to sms", {
    eventType: context.eventType,
    trialApplicationId: context.trialApplicationId,
    reason: alimtalk.errorMessage
  })

  return {
    channel: "sms_fallback",
    alimtalk
  }
}

export const sendParentNotificationSafely = async (
  context: ParentNotificationContext
): Promise<ParentNotificationResult | null> => {
  try {
    return await sendParentNotification(context)
  } catch (error) {
    const safeError = resolveSafeNotificationError(error)
    console.warn("[parent notification failed]", {
      eventType: context.eventType,
      applicationId: context.trialApplicationId,
      message: safeError.message,
      code: safeError.code,
      details: safeError.details,
      hint: safeError.hint
    })
    return null
  }
}
