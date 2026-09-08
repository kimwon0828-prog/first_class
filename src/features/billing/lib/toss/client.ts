// Toss Payments API 호출.
//
// 이 모듈은 process.env 를 읽지 않는다. 설정을 주입받아 순수하게 동작하므로
// verifier 가 가짜 fetch 로 전 경로를 돌릴 수 있다(실 결제 0).
// server-only 마커도 두지 않는다 — tsx 로 불러야 한다. 실제 호출부는
// toss/server.ts 가 감싸고, secret 은 거기서만 읽는다.
//
// 핵심 계약: 성공/실패/불명(unknown)을 절대 뭉개지 않는다.
//   timeout·네트워크 오류·5xx·409 는 unknown 이다. 결제가 됐을 수도 있다.
//   unknown 을 실패로 처리하면 돈이 빠진 학원을 past_due 로 만든다.

import {
  TOSS_API_BASE_URL,
  TOSS_CHARGE_TIMEOUT_MS,
  TOSS_DEFAULT_TIMEOUT_MS,
  TOSS_ENDPOINTS,
  isDefiniteFailureStatus,
  type TossBillingKeyIssued,
  type TossCallOutcome,
  type TossErrorBody,
  type TossPayment
} from "@/features/billing/lib/toss/contract"
import { buildTossBasicAuthHeader } from "@/features/billing/lib/toss/keys"

export type TossClientConfig = {
  secretKey: string
  baseUrl?: string
  fetchImpl?: typeof fetch
}

type RequestOptions = {
  method: "GET" | "POST"
  path: string
  body?: unknown
  idempotencyKey?: string
  timeoutMs?: number
}

const parseJson = (text: string): unknown => {
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const callToss = async <T>(
  config: TossClientConfig,
  options: RequestOptions
): Promise<TossCallOutcome<T>> => {
  const fetchImpl = config.fetchImpl ?? fetch
  const baseUrl = config.baseUrl ?? TOSS_API_BASE_URL
  const timeoutMs = options.timeoutMs ?? TOSS_DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const headers: Record<string, string> = {
    Authorization: buildTossBasicAuthHeader(config.secretKey)
  }
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json"
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey
  }

  let response: Response
  try {
    response = await fetchImpl(`${baseUrl}${options.path}`, {
      method: options.method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    })
  } catch (error) {
    // 응답을 받지 못했다. 결제가 됐는지 안 됐는지 여기서는 알 수 없다.
    return {
      outcome: "unknown",
      code: (error as Error)?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
      message: "Toss 응답을 받지 못했다",
      httpStatus: null
    }
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text().catch(() => "")
  const parsed = parseJson(text)

  if (response.ok) {
    return { outcome: "succeeded", data: parsed as T }
  }

  const errorBody = (parsed ?? {}) as TossErrorBody
  const code = errorBody.code ?? `HTTP_${response.status}`
  const message = errorBody.message ?? "Toss 요청이 실패했다"

  if (isDefiniteFailureStatus(response.status)) {
    return { outcome: "failed", code, message, httpStatus: response.status }
  }

  // 409(멱등 처리중) · 408 · 429 · 5xx. 다시 확인해야 한다.
  return { outcome: "unknown", code, message, httpStatus: response.status }
}

/** 결제창 인증 결과(authKey)로 빌링키를 발급한다. */
export const issueTossBillingKey = (
  config: TossClientConfig,
  input: { authKey: string; customerKey: string; idempotencyKey: string }
): Promise<TossCallOutcome<TossBillingKeyIssued>> =>
  callToss<TossBillingKeyIssued>(config, {
    method: "POST",
    path: TOSS_ENDPOINTS.issueBillingKey,
    body: { authKey: input.authKey, customerKey: input.customerKey },
    idempotencyKey: input.idempotencyKey
  })

/**
 * 빌링키로 결제를 승인한다.
 *
 * amount 는 호출자가 서버 카탈로그에서 읽어 넘긴 값만 들어온다.
 * 승인은 오래 걸릴 수 있어 timeout 을 길게 잡되, 끊겨도 unknown 으로만 돌려준다.
 */
export const chargeTossBillingKey = (
  config: TossClientConfig,
  input: {
    billingKey: string
    customerKey: string
    amount: number
    orderId: string
    orderName: string
    idempotencyKey: string
  }
): Promise<TossCallOutcome<TossPayment>> =>
  callToss<TossPayment>(config, {
    method: "POST",
    path: TOSS_ENDPOINTS.chargeBillingKey(input.billingKey),
    body: {
      customerKey: input.customerKey,
      amount: input.amount,
      orderId: input.orderId,
      orderName: input.orderName
    },
    idempotencyKey: input.idempotencyKey,
    timeoutMs: TOSS_CHARGE_TIMEOUT_MS
  })

/** 결제 조회. unknown 을 확정으로 바꾸는 유일한 수단이다. */
export const getTossPaymentByOrderId = (
  config: TossClientConfig,
  orderId: string
): Promise<TossCallOutcome<TossPayment>> =>
  callToss<TossPayment>(config, {
    method: "GET",
    path: TOSS_ENDPOINTS.paymentByOrderId(orderId)
  })

export const getTossPaymentByKey = (
  config: TossClientConfig,
  paymentKey: string
): Promise<TossCallOutcome<TossPayment>> =>
  callToss<TossPayment>(config, {
    method: "GET",
    path: TOSS_ENDPOINTS.paymentByKey(paymentKey)
  })
