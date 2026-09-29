import "server-only"

import { sendAlimtalk } from "@/features/notifications/alimtalk/send-alimtalk"
import type { ParentNotificationContext, ParentNotificationResult } from "@/features/notifications/alimtalk/types"
import { logSmsEventSafely } from "@/features/notifications/sms/log-sms-event"

const shouldFallbackToSms = (status: ParentNotificationResult["alimtalk"]["status"]) =>
  status === "disabled" || status === "failed" || status === "skipped"

const shouldWaitForFeedbackAlimtalkConfiguration = (
  context: ParentNotificationContext,
  result: ParentNotificationResult["alimtalk"]
) =>
  context.eventType === "trial_feedback_reminder" &&
  (result.status === "disabled" ||
    result.errorMessage === "alimtalk_template_missing" ||
    result.errorMessage === "alimtalk_provider_not_supported" ||
    result.errorMessage === "ncloud_alimtalk_env_missing_or_invalid")

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
      alimtalk,
      fallbackStatus: null
    }
  }

  // 피드백 리마인더는 알림톡으로 보내야 한다. 템플릿 승인이나 운영 설정이
  // 아직 끝나지 않은 상태를 SMS 발송으로 조용히 대체하지 않고 다음 cron에서
  // 다시 시도한다. 실제 provider 요청 실패에는 기존 SMS fallback을 유지한다.
  if (shouldWaitForFeedbackAlimtalkConfiguration(context, alimtalk)) {
    return {
      channel: "alimtalk",
      alimtalk,
      fallbackStatus: null
    }
  }

  const fallback = await logSmsEventSafely({
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
    alimtalk,
    fallbackStatus: fallback?.status ?? "failed"
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
