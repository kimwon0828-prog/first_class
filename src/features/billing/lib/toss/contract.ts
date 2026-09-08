// Toss Payments 자동결제(빌링) 연동 contract.
//
// 공식 문서에서 확인한 사실만 적는다. 추측한 endpoint/필드는 두지 않는다.
// (docs.tosspayments.com, 2026-09 확인)
//
//   빌링키 발급   POST /v1/billing/authorizations/issue   body { authKey, customerKey }
//   자동결제 승인 POST /v1/billing/{billingKey}           body { customerKey, amount, orderId, orderName }
//   결제 조회     GET  /v1/payments/{paymentKey}
//                 GET  /v1/payments/orders/{orderId}
//
//   인증        Authorization: Basic base64(`${secretKey}:`)  ← 콜론 필수
//   멱등        모든 POST 에 Idempotency-Key 헤더. 최대 300자, 15일 유효.
//               같은 키 재요청은 최초 응답을 그대로 돌려준다.
//               처리 중이면 409 IDEMPOTENT_REQUEST_PROCESSING.
//
// 자동결제 등록은 SDK v2 결제창으로 한다(카드 원번호를 우리 서버가 받지 않는다).
//   payment.requestBillingAuth({ method: "CARD", successUrl, failUrl })
//   → successUrl 로 authKey · customerKey 가 query 로 돌아온다.
//   requestBillingAuth 에는 amount / orderId 가 없다. 금액은 승인 단계에서만 쓴다.

export const TOSS_API_BASE_URL = "https://api.tosspayments.com"

// 문서 본문에는 .../v2 로 적혀 있으나 실제로 그 경로는 403 AccessDenied 다.
// 전역 TossPayments 를 정의하는 실물은 .../v2/standard 하나뿐이다(2026-09 실측).
export const TOSS_BILLING_SDK_URL = "https://js.tosspayments.com/v2/standard"

export const TOSS_ENDPOINTS = {
  issueBillingKey: "/v1/billing/authorizations/issue",
  chargeBillingKey: (billingKey: string) => `/v1/billing/${encodeURIComponent(billingKey)}`,
  paymentByKey: (paymentKey: string) => `/v1/payments/${encodeURIComponent(paymentKey)}`,
  paymentByOrderId: (orderId: string) => `/v1/payments/orders/${encodeURIComponent(orderId)}`
} as const

/**
 * 자동결제 승인은 오래 걸릴 수 있다. 여기서 끊더라도 Toss 쪽 결제는 진행 중일 수 있으므로,
 * timeout 을 "실패" 로 해석하지 않는다(→ TossCallOutcome 의 unknown).
 */
export const TOSS_CHARGE_TIMEOUT_MS = 60_000
export const TOSS_DEFAULT_TIMEOUT_MS = 15_000

/** customerKey 제약. 문서상 상한은 더 크지만 좁은 쪽(2~50)에 맞춰 둔다. */
export const TOSS_CUSTOMER_KEY_MIN_LENGTH = 2
export const TOSS_CUSTOMER_KEY_MAX_LENGTH = 50
/** orderId 제약. 영문/숫자/`-`/`_` 6~64자. */
export const TOSS_ORDER_ID_MIN_LENGTH = 6
export const TOSS_ORDER_ID_MAX_LENGTH = 64
export const TOSS_ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/
/** Idempotency-Key 상한. */
export const TOSS_IDEMPOTENCY_KEY_MAX_LENGTH = 300

/** 결제 객체 상태. 우리가 "결제됨" 으로 인정하는 것은 DONE 하나다. */
export type TossPaymentStatus =
  | "READY"
  | "IN_PROGRESS"
  | "WAITING_FOR_DEPOSIT"
  | "DONE"
  | "CANCELED"
  | "PARTIAL_CANCELED"
  | "ABORTED"
  | "EXPIRED"

/** 결제가 확정적으로 끝난 상태(더 기다려도 바뀌지 않는다). */
export const TOSS_TERMINAL_FAILURE_STATUSES: TossPaymentStatus[] = [
  "ABORTED",
  "EXPIRED",
  "CANCELED"
]

export type TossCard = {
  issuerCode?: string | null
  acquirerCode?: string | null
  /** 마스킹된 번호다. 원번호는 어떤 경우에도 받지 않는다. */
  number?: string | null
  cardType?: string | null
  ownerType?: string | null
}

export type TossPayment = {
  paymentKey: string
  orderId: string
  orderName?: string | null
  status: TossPaymentStatus
  totalAmount: number
  balanceAmount?: number | null
  approvedAt?: string | null
  requestedAt?: string | null
  currency?: string | null
  method?: string | null
  card?: TossCard | null
}

export type TossBillingKeyIssued = {
  billingKey: string
  customerKey: string
  cardCompany?: string | null
  /** 마스킹된 번호. */
  cardNumber?: string | null
  authenticatedAt?: string | null
  method?: string | null
}

export type TossErrorBody = {
  code?: string
  message?: string
}

/**
 * Toss 호출 결과.
 *
 * ⚠️ failed 와 unknown 을 반드시 구분한다.
 *   failed  : Toss 가 "이 결제는 실패" 라고 확정해 준 경우에만.
 *   unknown : timeout · 네트워크 오류 · 5xx · 409 처리중.
 *             결제가 되었을 수도 있다. 이 상태에서 payment_failed 로 넘기면
 *             이미 돈이 빠진 학원을 past_due 로 만든다. 반드시 조회로 확인한다.
 */
export type TossCallOutcome<T> =
  | { outcome: "succeeded"; data: T }
  | { outcome: "failed"; code: string; message: string; httpStatus: number }
  | { outcome: "unknown"; code: string; message: string; httpStatus: number | null }

/** 확정 실패로 볼 수 있는 HTTP 상태. 4xx 중 멱등 처리중(409)은 제외한다. */
export const isDefiniteFailureStatus = (httpStatus: number) =>
  httpStatus >= 400 && httpStatus < 500 && httpStatus !== 409 && httpStatus !== 408 && httpStatus !== 429
