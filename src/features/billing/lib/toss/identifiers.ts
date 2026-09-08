// 결제 시도를 가리키는 식별자들.
//
// 한 번의 논리적 결제 시도에는 세 개의 이름이 붙는다. 셋이 갈리면 이중 결제를 막을 수 없다.
//
//   attemptKey   우리 원장(organization_payments.idempotency_key). 사람이 읽는 형태.
//   orderId      Toss 주문번호. 영문/숫자/-/_ 6~64자 제약이 있다.
//   Idempotency-Key  Toss POST 재시도 보호. attemptKey 와 1:1 로 맞춘다.
//
// 규칙.
//   같은 논리 시도의 네트워크 재시도 → 세 값 모두 동일 (이중 결제 0)
//   유예 중의 다음 재시도          → 별개 시도이므로 attemptNumber 를 올린다
//
// 갱신 시도는 결정적이다. Cron 이 두 번 돌아도 같은 기간에는 같은 키가 나온다.

import {
  TOSS_IDEMPOTENCY_KEY_MAX_LENGTH,
  TOSS_ORDER_ID_MAX_LENGTH,
  TOSS_ORDER_ID_PATTERN
} from "@/features/billing/lib/toss/contract"

const compactUuid = (value: string) => value.replace(/-/g, "").toLowerCase()

/** 2026-10-10T00:00:00.000Z → 202610100000 */
const compactInstant = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("invalid_billing_instant")
  }

  return date.toISOString().replace(/[-:TZ.]/g, "").slice(0, 12)
}

export type BillingAttempt = {
  /** 원장 멱등 키. apply_billing_event 의 p_idempotency_key 로 그대로 간다. */
  attemptKey: string
  /** Toss 주문번호. */
  orderId: string
  /** Toss POST 헤더용. */
  idempotencyKey: string
}

const assertOrderId = (orderId: string) => {
  if (!TOSS_ORDER_ID_PATTERN.test(orderId) || orderId.length > TOSS_ORDER_ID_MAX_LENGTH) {
    throw new Error(`invalid_toss_order_id:${orderId.length}`)
  }

  return orderId
}

const assertIdempotencyKey = (key: string) => {
  if (key.length === 0 || key.length > TOSS_IDEMPOTENCY_KEY_MAX_LENGTH) {
    throw new Error(`invalid_toss_idempotency_key:${key.length}`)
  }

  return key
}

/**
 * 최초 결제.
 *
 * checkout session 하나가 결제 하나다. session id 를 그대로 쓰므로 같은 callback 이
 * 여러 번 들어와도 같은 키가 나온다.
 */
export const buildInitialBillingAttempt = (checkoutSessionId: string): BillingAttempt => {
  const compact = compactUuid(checkoutSessionId)
  const orderId = assertOrderId(`fsc-${compact}`)

  return {
    attemptKey: `checkout:${checkoutSessionId}`,
    orderId,
    idempotencyKey: assertIdempotencyKey(orderId)
  }
}

/**
 * 갱신 결제.
 *
 * 같은 (조직, 기간 종료) 조합이면 언제 호출해도 같은 키다 — Cron 중복 실행과
 * Vercel 재시도에서 결제가 두 번 일어나지 않는다.
 *
 * attemptNumber 는 유예 기간 안의 재시도 차수다. 0 이 최초 시도이며,
 * 재시도는 별개 결제 시도이므로 키가 달라야 한다(같으면 Toss 가 최초 응답을 그대로 준다).
 */
export const buildRenewalBillingAttempt = (
  organizationId: string,
  periodEnd: string,
  attemptNumber = 0
): BillingAttempt => {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 0 || attemptNumber > 9) {
    throw new Error("invalid_renewal_attempt_number")
  }

  const orderId = assertOrderId(
    `fsr-${compactUuid(organizationId)}-${compactInstant(periodEnd)}-a${attemptNumber}`
  )

  return {
    attemptKey: `renewal:${organizationId}:${new Date(periodEnd).toISOString()}:a${attemptNumber}`,
    orderId,
    idempotencyKey: assertIdempotencyKey(orderId)
  }
}

/** 주문명. 명세서에 그대로 찍히므로 조직명 같은 식별 정보를 넣지 않는다. */
export const buildBillingOrderName = (planName: string) => `첫수업 ${planName} 구독`
