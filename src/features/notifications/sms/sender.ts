import { maskPhoneNumber, normalizePhoneNumber } from "@/features/notifications/sms/phone"
import type { DryRunSmsSendInput, DryRunSmsSendResult } from "@/features/notifications/sms/types"

export const sendDryRunSms = async ({
  recipientType,
  phone,
  smsEnabled,
  messagePreview
}: DryRunSmsSendInput): Promise<DryRunSmsSendResult> => {
  void messagePreview

  const normalizedPhone = normalizePhoneNumber(phone)
  const recipientPhoneMasked = maskPhoneNumber(normalizedPhone)

  if (!normalizedPhone) {
    return {
      status: "skipped",
      provider: "dry_run",
      providerMessageId: null,
      errorMessage: `${recipientType}_phone_missing_or_invalid`,
      recipientPhoneMasked,
      sentAt: null
    }
  }

  if (recipientType === "teacher" && smsEnabled === false) {
    return {
      status: "skipped",
      provider: "dry_run",
      providerMessageId: null,
      errorMessage: "teacher_sms_disabled",
      recipientPhoneMasked,
      sentAt: null
    }
  }

  return {
    status: "dry_run",
    provider: "dry_run",
    providerMessageId: null,
    errorMessage: null,
    recipientPhoneMasked,
    sentAt: null
  }
}
