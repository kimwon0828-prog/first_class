import "server-only"

import { sendNcloudSms } from "@/features/notifications/sms/providers/ncloud"
import { maskPhoneNumber, normalizePhoneNumber } from "@/features/notifications/sms/phone"
import type { SmsSendInput, SmsSendResult } from "@/features/notifications/sms/types"

const resolveEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const isSmsSendEnabled = () => process.env.SMS_SEND_ENABLED === "true"

const getSmsProvider = () => {
  const provider = resolveEnvValue(process.env.SMS_PROVIDER)
  return provider ? provider.toLowerCase() : null
}

const buildDryRunResult = ({
  recipientPhoneMasked,
  errorMessage
}: {
  recipientPhoneMasked: string | null
  errorMessage: string | null
}): SmsSendResult => ({
  status: errorMessage ? "skipped" : "dry_run",
  provider: "dry_run",
  providerMessageId: null,
  errorMessage,
  recipientPhoneMasked,
  sentAt: null
})

const getNcloudConfig = () => {
  const accessKey = resolveEnvValue(process.env.NCP_ACCESS_KEY)
  const secretKey = resolveEnvValue(process.env.NCP_SECRET_KEY)
  const serviceId = resolveEnvValue(process.env.NCP_SENS_SMS_SERVICE_ID)
  const fromNumberRaw = resolveEnvValue(process.env.NCP_SENS_SMS_FROM_NUMBER)
  const fromNumber = normalizePhoneNumber(fromNumberRaw)

  if (!accessKey || !secretKey || !serviceId || !fromNumberRaw || !fromNumber) {
    return null
  }

  return {
    accessKey,
    secretKey,
    serviceId,
    fromNumber
  }
}

export const sendSms = async ({
  recipientType,
  phone,
  smsEnabled,
  messagePreview
}: SmsSendInput): Promise<SmsSendResult> => {
  const normalizedPhone = normalizePhoneNumber(phone)
  const recipientPhoneMasked = maskPhoneNumber(normalizedPhone)

  if (!normalizedPhone) {
    return buildDryRunResult({
      recipientPhoneMasked,
      errorMessage: `${recipientType}_phone_missing_or_invalid`,
    })
  }

  if (recipientType === "teacher" && smsEnabled === false) {
    return buildDryRunResult({
      recipientPhoneMasked,
      errorMessage: "teacher_sms_disabled",
    })
  }

  if (!isSmsSendEnabled()) {
    return buildDryRunResult({
      recipientPhoneMasked,
      errorMessage: null
    })
  }

  if (getSmsProvider() !== "ncloud") {
    return buildDryRunResult({
      recipientPhoneMasked,
      errorMessage: "sms_provider_not_supported"
    })
  }

  const ncloudConfig = getNcloudConfig()
  if (!ncloudConfig) {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: null,
      errorMessage: "ncloud_env_missing_or_invalid",
      recipientPhoneMasked,
      sentAt: null
    }
  }

  try {
    return await sendNcloudSms({
      config: ncloudConfig,
      to: normalizedPhone,
      content: messagePreview,
      recipientPhoneMasked: recipientPhoneMasked ?? normalizedPhone
    })
  } catch {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: null,
      errorMessage: "ncloud_request_failed",
      recipientPhoneMasked,
      sentAt: null
    }
  }
}
