import "server-only"

import { prepareSmsContent } from "@/features/notifications/sms/byte-utils"
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
  preparedContent,
  recipientPhoneMasked,
  errorMessage
}: {
  preparedContent: ReturnType<typeof prepareSmsContent>
  recipientPhoneMasked: string | null
  errorMessage: string | null
}): SmsSendResult => ({
  status: errorMessage ? "skipped" : "dry_run",
  provider: "dry_run",
  providerMessageId: null,
  errorMessage,
  recipientPhoneMasked,
  sentAt: null,
  messageType: preparedContent.messageType,
  byteLength: preparedContent.byteLength
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
  const preparedContent = prepareSmsContent(messagePreview)
  const normalizedPhone = normalizePhoneNumber(phone)
  const recipientPhoneMasked = maskPhoneNumber(normalizedPhone)

  console.info("[sms send prepared]", {
    recipientType,
    messageType: preparedContent.messageType,
    byteLength: preparedContent.byteLength,
    hadUnsupportedCharacters: preparedContent.hadUnsupportedCharacters
  })

  if (!normalizedPhone) {
    return buildDryRunResult({
      preparedContent,
      recipientPhoneMasked,
      errorMessage: `${recipientType}_phone_missing_or_invalid`,
    })
  }

  if (recipientType === "teacher" && smsEnabled === false) {
    return buildDryRunResult({
      preparedContent,
      recipientPhoneMasked,
      errorMessage: "teacher_sms_disabled",
    })
  }

  if (!isSmsSendEnabled()) {
    return buildDryRunResult({
      preparedContent,
      recipientPhoneMasked,
      errorMessage: null
    })
  }

  if (getSmsProvider() !== "ncloud") {
    return buildDryRunResult({
      preparedContent,
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
      sentAt: null,
      messageType: preparedContent.messageType,
      byteLength: preparedContent.byteLength
    }
  }

  try {
    return await sendNcloudSms({
      config: ncloudConfig,
      to: normalizedPhone,
      preparedContent,
      recipientPhoneMasked: recipientPhoneMasked ?? normalizedPhone
    })
  } catch {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: null,
      errorMessage: "ncloud_request_failed",
      recipientPhoneMasked,
      sentAt: null,
      messageType: preparedContent.messageType,
      byteLength: preparedContent.byteLength
    }
  }
}
