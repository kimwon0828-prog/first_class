import "server-only"

import { sendNcloudAlimtalk } from "@/features/notifications/alimtalk/ncloud-alimtalk-client"
import type { AlimtalkSendResult, ParentNotificationContext } from "@/features/notifications/alimtalk/types"
import { renderAlimtalkTemplate } from "@/features/notifications/alimtalk/templates"
import { maskPhoneNumber, normalizePhoneNumber } from "@/features/notifications/sms/phone"

const resolveEnvValue = (value: string | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const isAlimtalkSendEnabled = () => process.env.ALIMTALK_SEND_ENABLED === "true"

const getAlimtalkProvider = () => {
  const provider = resolveEnvValue(process.env.ALIMTALK_PROVIDER)
  return provider ? provider.toLowerCase() : null
}

const buildSkippedResult = ({
  status,
  errorMessage,
  recipientPhoneMasked
}: {
  status: AlimtalkSendResult["status"]
  errorMessage: string | null
  recipientPhoneMasked: string | null
}): AlimtalkSendResult => ({
  status,
  provider: status === "disabled" ? "disabled" : "dry_run",
  providerMessageId: null,
  errorMessage,
  recipientPhoneMasked,
  sentAt: null
})

const getNcloudConfig = () => {
  const accessKey = resolveEnvValue(process.env.NCP_ACCESS_KEY)
  const secretKey = resolveEnvValue(process.env.NCP_SECRET_KEY)
  const serviceId = resolveEnvValue(process.env.NCP_SENS_ALIMTALK_SERVICE_ID)
  const channelId = resolveEnvValue(process.env.NCP_SENS_ALIMTALK_CHANNEL_ID)

  if (!accessKey || !secretKey || !serviceId || !channelId) {
    return null
  }

  return {
    accessKey,
    secretKey,
    serviceId,
    channelId
  }
}

export const sendAlimtalk = async (
  context: ParentNotificationContext
): Promise<AlimtalkSendResult> => {
  const normalizedPhone = normalizePhoneNumber(context.parentPhone)
  const recipientPhoneMasked = maskPhoneNumber(normalizedPhone)

  if (!normalizedPhone) {
    return buildSkippedResult({
      status: "skipped",
      errorMessage: "parent_phone_missing_or_invalid",
      recipientPhoneMasked
    })
  }

  if (!isAlimtalkSendEnabled()) {
    return buildSkippedResult({
      status: "disabled",
      errorMessage: "alimtalk_disabled",
      recipientPhoneMasked
    })
  }

  const template = renderAlimtalkTemplate(context)
  if (!template) {
    return buildSkippedResult({
      status: "skipped",
      errorMessage: "alimtalk_template_missing",
      recipientPhoneMasked
    })
  }

  if (getAlimtalkProvider() !== "ncloud") {
    return buildSkippedResult({
      status: "failed",
      errorMessage: "alimtalk_provider_not_supported",
      recipientPhoneMasked
    })
  }

  const ncloudConfig = getNcloudConfig()
  if (!ncloudConfig) {
    return buildSkippedResult({
      status: "failed",
      errorMessage: "ncloud_alimtalk_env_missing_or_invalid",
      recipientPhoneMasked
    })
  }

  try {
    return await sendNcloudAlimtalk({
      config: ncloudConfig,
      to: normalizedPhone,
      templateCode: template.templateCode,
      content: template.content,
      recipientPhoneMasked: recipientPhoneMasked ?? normalizedPhone
    })
  } catch {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: null,
      errorMessage: "ncloud_alimtalk_request_failed",
      recipientPhoneMasked,
      sentAt: null
    }
  }
}
