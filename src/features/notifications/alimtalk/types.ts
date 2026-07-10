import type { ParentSmsEventType } from "@/features/notifications/sms/types"

export const PARENT_ALIMTALK_EVENT_TYPES = [
  "trial_schedule_confirmed",
  "trial_rejected",
  "trial_completed",
  "trial_reminder"
] as const

export type ParentAlimtalkEventType = (typeof PARENT_ALIMTALK_EVENT_TYPES)[number]

export const isParentAlimtalkEventType = (
  value: ParentSmsEventType | string
): value is ParentAlimtalkEventType =>
  PARENT_ALIMTALK_EVENT_TYPES.includes(value as ParentAlimtalkEventType)

export type ParentNotificationContext = {
  eventType: ParentAlimtalkEventType
  organizationId: string
  trialApplicationId: string
  createdBy?: string | null
  parentId: string | null
  parentPhone: string | null
  parentName: string | null
  studentName: string | null
  academyName: string | null
  classId: string | null
  classTitle: string | null
  requestedSlotAt: string | null
  confirmedSlotAt: string | null
  selectedScheduleLabel: string | null
}

export type AlimtalkTemplatePayload = {
  templateCode: string
  content: string
}

export type AlimtalkSendResult = {
  status: "disabled" | "skipped" | "failed" | "sent"
  provider: "disabled" | "dry_run" | "ncloud"
  providerMessageId: string | null
  errorMessage: string | null
  recipientPhoneMasked: string | null
  sentAt: string | null
}

export type ParentNotificationResult = {
  channel: "alimtalk" | "sms_fallback"
  alimtalk: AlimtalkSendResult
}
