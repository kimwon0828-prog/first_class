import "server-only"

import { createHmac } from "node:crypto"

import type { AlimtalkSendResult } from "@/features/notifications/alimtalk/types"

export type NcloudAlimtalkConfig = {
  accessKey: string
  secretKey: string
  serviceId: string
  channelId: string
}

type SendNcloudAlimtalkInput = {
  config: NcloudAlimtalkConfig
  to: string
  templateCode: string
  content: string
  recipientPhoneMasked: string
}

type NcloudAlimtalkResponse = {
  requestId?: string
  requestTime?: string
  statusCode?: string
  statusName?: string
}

const NCLOUD_SENS_BASE_URL = "https://sens.apigw.ntruss.com"

const createSignature = ({
  requestPath,
  timestamp,
  accessKey,
  secretKey
}: {
  requestPath: string
  timestamp: string
  accessKey: string
  secretKey: string
}) => {
  const message = `POST ${requestPath}\n${timestamp}\n${accessKey}`
  return createHmac("sha256", secretKey).update(message, "utf8").digest("base64")
}

const resolveErrorMessage = (status: number, body: unknown) => {
  if (body && typeof body === "object") {
    const errorBody = body as {
      statusName?: unknown
      error?: { errorCode?: unknown; message?: unknown }
      message?: unknown
    }

    if (typeof errorBody.error?.errorCode === "string") {
      return `ncloud_alimtalk_api_error_${errorBody.error.errorCode}`
    }

    if (typeof errorBody.message === "string" && errorBody.message.trim()) {
      return `ncloud_alimtalk_http_${status}_${errorBody.message.trim().toLowerCase()}`
    }

    if (typeof errorBody.statusName === "string" && errorBody.statusName.trim()) {
      return `ncloud_alimtalk_http_${status}_${errorBody.statusName.trim().toLowerCase()}`
    }
  }

  return `ncloud_alimtalk_http_${status}`
}

export const sendNcloudAlimtalk = async ({
  config,
  to,
  templateCode,
  content,
  recipientPhoneMasked
}: SendNcloudAlimtalkInput): Promise<AlimtalkSendResult> => {
  const requestPath = `/alimtalk/v2/services/${config.serviceId}/messages`
  const timestamp = Date.now().toString()
  const signature = createSignature({
    requestPath,
    timestamp,
    accessKey: config.accessKey,
    secretKey: config.secretKey
  })

  const response = await fetch(`${NCLOUD_SENS_BASE_URL}${requestPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": config.accessKey,
      "x-ncp-apigw-signature-v2": signature
    },
    body: JSON.stringify({
      plusFriendId: config.channelId,
      templateCode,
      messages: [
        {
          to,
          content
        }
      ]
    }),
    cache: "no-store"
  })

  let responseBody: unknown = null
  try {
    responseBody = await response.json()
  } catch {
    responseBody = null
  }

  if (!response.ok) {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: null,
      errorMessage: resolveErrorMessage(response.status, responseBody),
      recipientPhoneMasked,
      sentAt: null
    }
  }

  const data = (responseBody ?? {}) as NcloudAlimtalkResponse
  if (data.statusCode !== "202" || data.statusName !== "success") {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: data.requestId ?? null,
      errorMessage: "ncloud_alimtalk_unexpected_response",
      recipientPhoneMasked,
      sentAt: null
    }
  }

  return {
    status: "sent",
    provider: "ncloud",
    providerMessageId: data.requestId ?? null,
    errorMessage: null,
    recipientPhoneMasked,
    sentAt: data.requestTime ?? new Date().toISOString()
  }
}
