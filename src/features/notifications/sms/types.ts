export const SMS_RECIPIENT_TYPES = ["parent", "teacher", "admin"] as const
export type SmsRecipientType = (typeof SMS_RECIPIENT_TYPES)[number]

export const PARENT_SMS_EVENT_TYPES = [
  "trial_contact_started",
  "trial_rejected",
  "trial_schedule_confirmed",
  "trial_completed",
  "trial_enrolled",
  "trial_reminder"
] as const
export type ParentSmsEventType = (typeof PARENT_SMS_EVENT_TYPES)[number]

export const TEACHER_SMS_EVENT_TYPES = [
  "teacher_trial_requested",
  "teacher_trial_assigned",
  "teacher_trial_schedule_confirmed",
  "teacher_trial_schedule_updated",
  "teacher_trial_canceled",
  "teacher_trial_reminder"
] as const
export type TeacherSmsEventType = (typeof TEACHER_SMS_EVENT_TYPES)[number]

export const ADMIN_SMS_EVENT_TYPES = [
  "admin_trial_requested",
  "admin_trial_canceled",
  "admin_trial_schedule_confirmed",
  "admin_trial_reminder"
] as const
export type AdminSmsEventType = (typeof ADMIN_SMS_EVENT_TYPES)[number]

export const SMS_EVENT_TYPES = [
  ...PARENT_SMS_EVENT_TYPES,
  ...TEACHER_SMS_EVENT_TYPES,
  ...ADMIN_SMS_EVENT_TYPES
] as const
export type SmsEventType = (typeof SMS_EVENT_TYPES)[number]

export const SMS_LOG_STATUSES = ["dry_run", "pending", "sent", "failed", "skipped"] as const
export type SmsLogStatus = (typeof SMS_LOG_STATUSES)[number]

export const SMS_PROVIDERS = ["dry_run", "ncloud"] as const
export type SmsProvider = (typeof SMS_PROVIDERS)[number]

export type SmsTemplateKey = SmsEventType

export type SmsTemplateContext = {
  academyName: string | null
  classTitle: string | null
  childName: string | null
  parentDisplayName: string | null
  scheduledAt: string | null
  requestedAt: string | null
  selectedScheduleLabel: string | null
  assignedTeacherName: string | null
}

export type SmsTemplateRenderInput = {
  recipientType: SmsRecipientType
  eventType: SmsEventType
  context: SmsTemplateContext
}

export type SmsTemplateRenderResult = {
  templateKey: SmsTemplateKey
  messagePreview: string
}

export type SmsSendInput = {
  recipientType: SmsRecipientType
  phone: string | null
  smsEnabled?: boolean
  messagePreview: string
}

export type SmsSendResult = {
  status: Extract<SmsLogStatus, "dry_run" | "sent" | "failed" | "skipped">
  provider: SmsProvider
  providerMessageId: string | null
  errorMessage: string | null
  recipientPhoneMasked: string | null
  sentAt: string | null
}
