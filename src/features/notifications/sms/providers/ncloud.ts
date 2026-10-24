import "server-only"

import { createHmac } from "node:crypto"

import type { SmsPreparedContent, SmsSendResult } from "@/features/notifications/sms/types"

export type NcloudSmsProviderConfig = {
  accessKey: string
  secretKey: string
  serviceId: string
  fromNumber: string
}

type SendNcloudSmsInput = {
  config: NcloudSmsProviderConfig
  to: string
  /** 일반(COMM) · 광고(AD). 광고는 NCP 콘솔에 080 수신거부 번호가 등록돼 있어야 한다. */
  contentType?: "COMM" | "AD"
  preparedContent: SmsPreparedContent
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
  method: "POST" | "GET"
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
  contentType = "COMM",
  preparedContent,
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
      type: preparedContent.messageType,
      contentType,
      countryCode: "82",
      from: config.fromNumber,
      subject: preparedContent.subject ?? undefined,
      content: preparedContent.content,
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
      sentAt: null,
      messageType: preparedContent.messageType,
      byteLength: preparedContent.byteLength
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
      sentAt: null,
      messageType: preparedContent.messageType,
      byteLength: preparedContent.byteLength
    }
  }

  return {
    status: "sent",
    provider: "ncloud",
    providerMessageId: data.requestId ?? null,
    errorMessage: null,
    recipientPhoneMasked,
    sentAt: data.requestTime ?? new Date().toISOString(),
    messageType: preparedContent.messageType,
    byteLength: preparedContent.byteLength
  }
}

// ── 조회(GET) ─────────────────────────────────────────────────
// 서명 대상 URI 는 query string 까지 포함한다(NCP API Gateway 규칙).

const getNcloud = async (config: NcloudSmsProviderConfig, requestPath: string): Promise<{ status: number; body: unknown }> => {
  const timestamp = Date.now().toString()
  const signature = createSignature({ method: "GET", requestPath, timestamp, accessKey: config.accessKey, secretKey: config.secretKey })
  const response = await fetch(`${NCLOUD_SMS_BASE_URL}${requestPath}`, {
    method: "GET",
    headers: {
      "x-ncp-apigw-timestamp": timestamp,
      "x-ncp-iam-access-key": config.accessKey,
      "x-ncp-apigw-signature-v2": signature
    },
    cache: "no-store"
  })
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  return { status: response.status, body }
}

export type NcloudUnsubscribe = {
  /** 거부한 번호(숫자만) */
  clientTelNo: string
  /** "YYYY-MM-DDTHH:mm:ss.sss"(KST) */
  registerTime: string
  /** C = 080 ARS, M = 콘솔에서 직접 넣음 */
  registerType: string
}

/**
 * 수신 거부 번호 조회(GET /sms/v2/services/{serviceId}/unsubscribes). 등록 시각 기준 기간 · 페이지(100개씩).
 * 080 서비스를 아직 신청하지 않았거나 목록이 비어 있으면 빈 배열이다.
 */
export const listNcloudUnsubscribes = async (
  config: NcloudSmsProviderConfig,
  window: { startTime: number; endTime: number },
  maxPages = 50
): Promise<NcloudUnsubscribe[]> => {
  const items: NcloudUnsubscribe[] = []
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const query = new URLSearchParams({
      startTime: String(window.startTime),
      endTime: String(window.endTime),
      pageSize: "100",
      pageIndex: String(pageIndex)
    })
    const { status, body } = await getNcloud(config, `/sms/v2/services/${config.serviceId}/unsubscribes?${query.toString()}`)
    if (status === 404) return items
    if (status < 200 || status >= 300) throw new Error(resolveErrorMessage(status, body))
    const page = (Array.isArray(body) ? body : []) as Array<Partial<NcloudUnsubscribe>>
    for (const row of page) {
      if (typeof row.clientTelNo === "string" && row.clientTelNo.replace(/\D/g, "")) {
        items.push({ clientTelNo: row.clientTelNo.replace(/\D/g, ""), registerTime: String(row.registerTime ?? ""), registerType: String(row.registerType ?? "") })
      }
    }
    if (page.length < 100) return items
  }
  return items
}

export type NcloudMessageResult = {
  /** READY | PROCESSING | COMPLETED */
  status: string
  /** success | fail */
  statusName: string
  /** 수신 결과 코드(예: 0 성공, 3018 · E917 등) */
  statusCode: string | null
}

/** 메시지 발송 목록 조회(GET /sms/v2/services/{serviceId}/messages?requestId=). 한 요청에 한 명씩 보내므로 첫 메시지를 본다. */
export const getNcloudMessageResult = async (config: NcloudSmsProviderConfig, requestId: string): Promise<NcloudMessageResult | null> => {
  const query = new URLSearchParams({ requestId })
  const { status, body } = await getNcloud(config, `/sms/v2/services/${config.serviceId}/messages?${query.toString()}`)
  if (status === 404) return null
  if (status < 200 || status >= 300) throw new Error(resolveErrorMessage(status, body))
  const message = ((body as { messages?: unknown[] } | null)?.messages ?? [])[0] as Partial<Record<"status" | "statusName" | "statusCode", unknown>> | undefined
  if (!message) return null
  return {
    status: String(message.status ?? ""),
    statusName: String(message.statusName ?? ""),
    statusCode: message.statusCode == null ? null : String(message.statusCode)
  }
}
