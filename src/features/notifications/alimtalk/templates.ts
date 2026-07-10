import { renderSmsTemplate } from "@/features/notifications/sms/templates"
import type { ParentNotificationContext, AlimtalkTemplatePayload } from "@/features/notifications/alimtalk/types"

const resolveTemplateCode = (eventType: ParentNotificationContext["eventType"]) => {
  switch (eventType) {
    case "trial_schedule_confirmed":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_SCHEDULE_CONFIRMED?.trim() ?? ""
    case "trial_rejected":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_REJECTED?.trim() ?? ""
    case "trial_completed":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_COMPLETED?.trim() ?? ""
    case "trial_reminder":
      return process.env.ALIMTALK_TEMPLATE_TRIAL_REMINDER?.trim() ?? ""
  }
}

export const renderAlimtalkTemplate = (
  context: ParentNotificationContext
): AlimtalkTemplatePayload | null => {
  const templateCode = resolveTemplateCode(context.eventType)
  if (!templateCode) {
    return null
  }

  const rendered = renderSmsTemplate({
    recipientType: "parent",
    eventType: context.eventType,
    context: {
      academyName: context.academyName,
      classTitle: context.classTitle,
      childName: context.studentName,
      parentDisplayName: context.parentName,
      scheduledAt: context.confirmedSlotAt,
      requestedAt: context.requestedSlotAt,
      selectedScheduleLabel: context.selectedScheduleLabel,
      assignedTeacherName: null
    }
  })

  return {
    templateCode,
    content: rendered.messagePreview
  }
}
