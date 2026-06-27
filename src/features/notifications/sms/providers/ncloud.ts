import "server-only"

import { createHmac } from "node:crypto"

import type { SmsSendResult } from "@/features/notifications/sms/types"

export type NcloudSmsProviderConfig = {
  accessKey: string
  secretKey: string
  serviceId: string
  fromNumber: string
}

type SendNcloudSmsInput = {
  config: NcloudSmsProviderConfig
  to: string
  content: string
  recipientPhoneMasked: string
}

type NcloudSmsResponse = {
  requestId?: string
  requestTime?: string
  statusCode?: string
  statusName?: string
}

const NCLOUD_SMS_BASE_URL = "https://sens.apigw.ntruss.com"

const createSignature = ({
  method,
  requestPath,
  timestamp,
  accessKey,
  secretKey
}: {
  method: "POST"
  requestPath: string
  timestamp: string
  accessKey: string
  secretKey: string
}) => {
  const message = `${method} ${requestPath}\n${timestamp}\n${accessKey}`
  return createHmac("sha256", secretKey).update(message, "utf8").digest("base64")
}

const resolveErrorMessage = (status: number, body: unknown) => {
  if (body && typeof body === "object") {
    const errorBody = body as {
      statusName?: unknown
      error?: { errorCode?: unknown; message?: unknown }
    }

    if (typeof errorBody.error?.errorCode === "string") {
      return `ncloud_api_error_${errorBody.error.errorCode}`
    }

    if (typeof errorBody.statusName === "string" && errorBody.statusName.trim()) {
      return `ncloud_http_${status}_${errorBody.statusName.trim().toLowerCase()}`
    }
  }

  return `ncloud_http_${status}`
}

export const sendNcloudSms = async ({
  config,
  to,
  content,
  recipientPhoneMasked
}: SendNcloudSmsInput): Promise<SmsSendResult> => {
  const requestPath = `/sms/v2/services/${config.serviceId}/messages`
  const timestamp = Date.now().toString()
  const signature = createSignature({
    method: "POST",
    requestPath,
    timestamp,
    accessKey: config.accessKey,
    secretKey: config.secretKey
  })

  const response = await fetch(`${NCLOUD_SMS_BASE_URL}${requestPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": config.accessKey,
      "x-ncp-apigw-signature-v2": signature
    },
    body: JSON.stringify({
      type: "SMS",
      contentType: "COMM",
      countryCode: "82",
      from: config.fromNumber,
      content,
      messages: [{ to }]
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

  const data = (responseBody ?? {}) as NcloudSmsResponse
  if (data.statusCode !== "202" || data.statusName !== "success") {
    return {
      status: "failed",
      provider: "ncloud",
      providerMessageId: data.requestId ?? null,
      errorMessage: "ncloud_unexpected_response",
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
