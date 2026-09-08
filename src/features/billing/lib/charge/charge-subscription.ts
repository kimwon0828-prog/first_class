import type {
  BillingEventResult,
  VerifiedBillingEvent
} from "@/features/billing/lib/billing-events"
import {
  chargeTossBillingKey,
  getTossPaymentByOrderId,
  type TossClientConfig
} from "@/features/billing/lib/toss/client"
import type { TossPayment } from "@/features/billing/lib/toss/contract"
import { verifyTossPayment } from "@/features/billing/lib/toss/verify-payment"

// 자동결제 1회 실행. 최초 결제와 갱신이 같은 경로를 쓴다.
//
// 구독 반영은 주입받은 applyEvent 로만 한다(실제 호출부는 applyVerifiedBillingEvent 를 넘긴다).
// 그래야 verifier 가 DB·secret 없이 가짜 Toss 응답으로 전 분기를 돌릴 수 있다.
// server-only 마커를 두지 않는 이유도 같다 — 이 모듈에는 secret 이 없다.
//
// 절대 지키는 것.
//   1. 금액은 호출자가 서버 카탈로그에서 읽어 넘긴 값만 쓴다.
//   2. Toss 가 200 을 줬다는 사실만으로 구독을 열지 않는다. Payment 객체를 검증한다.
//   3. 응답을 못 받았으면(timeout·5xx·409) 결제 조회로 확인한다.
//      끝까지 모르면 pending 으로 남긴다 — 절대 payment_failed 로 넘기지 않는다.
//   4. 구독 상태 변경은 applyVerifiedBillingEvent 하나로만 한다.
//
// pending 을 원장(organization_payments)에 미리 적지 않는 이유.
//   원장 행을 만들면 그 멱등 키가 소비된다. 나중에 대사로 "사실은 성공" 을 알아내도
//   apply_billing_event 가 duplicate 를 돌려주고 구독이 영원히 열리지 않는다.
//   그래서 결과가 확정될 때까지 원장에 쓰지 않고, 미확정 상태는
//   checkout session(authorized) / 기간이 지난 구독으로 대사가 찾아낸다.

export type SubscriptionChargeInput = {
  organizationId: string
  billingKey: string
  customerKey: string
  planCode: "standard" | "pro"
  /** 서버 카탈로그 금액. */
  amount: number
  orderId: string
  orderName: string
  /** Toss 멱등 헤더용. */
  idempotencyKey: string
  /** 원장 멱등 키. */
  attemptKey: string
  eventType: "initial_payment_succeeded" | "renewal_succeeded"
  /**
   * 이 결제가 여는 이용 기간. 승인 시각을 받아 계산한다.
   *
   * 최초 결제는 승인 시각이 곧 기간 시작이라, 호출 전에 미리 정하면 실제 승인 시각과
   * 어긋난다. 갱신은 승인 시각과 무관하게 직전 기간에서 이어지므로 인자를 무시하면 된다.
   */
  resolvePeriod: (approvedAt: string) => { periodStart: string; periodEnd: string }
  /** 구독 상태를 바꾸는 유일한 통로. */
  applyEvent: (event: VerifiedBillingEvent) => Promise<BillingEventResult>
}

export type SubscriptionChargeResult =
  | { status: "succeeded"; payment: TossPayment; approvedAt: string }
  /** Toss 가 실패로 확정했다. 원장에 실패를 남기고 구독은 계약대로 처리된다. */
  | { status: "declined"; code: string }
  /** 결과를 모른다. 대사가 확인할 때까지 원장·구독 모두 건드리지 않는다. */
  | { status: "pending"; code: string }
  /** 우리 기대와 다른 결제다. 반영하지 않는다. */
  | { status: "mismatch"; code: string }

const applySuccess = async (input: SubscriptionChargeInput, payment: TossPayment, approvedAt: string) => {
  const period = input.resolvePeriod(approvedAt)
  await input.applyEvent({
    organizationId: input.organizationId,
    occurredAt: approvedAt,
    provider: "toss",
    type: input.eventType,
    idempotencyKey: input.attemptKey,
    providerPaymentId: payment.paymentKey,
    planCode: input.planCode,
    amount: input.amount,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd
  })
}

const applyDecline = async (input: SubscriptionChargeInput, code: string, failedAt: string) => {
  await input.applyEvent({
    organizationId: input.organizationId,
    occurredAt: failedAt,
    provider: "toss",
    type: "payment_failed",
    idempotencyKey: input.attemptKey,
    providerPaymentId: null,
    planCode: input.planCode,
    amount: input.amount,
    failureCode: code
  })
}

export const chargeSubscription = async (
  config: TossClientConfig,
  input: SubscriptionChargeInput
): Promise<SubscriptionChargeResult> => {
  const charged = await chargeTossBillingKey(config, {
    billingKey: input.billingKey,
    customerKey: input.customerKey,
    amount: input.amount,
    orderId: input.orderId,
    orderName: input.orderName,
    idempotencyKey: input.idempotencyKey
  })

  let payment: TossPayment | null = null

  if (charged.outcome === "succeeded") {
    payment = charged.data
  } else if (charged.outcome === "failed") {
    // 카드사 거절 등 확정 실패. 그래도 Toss 쪽 결제 객체가 남아 있을 수 있어 한 번 확인한다.
    const looked = await getTossPaymentByOrderId(config, input.orderId)
    if (looked.outcome === "succeeded") {
      payment = looked.data
    } else {
      await applyDecline(input, charged.code, new Date().toISOString())
      return { status: "declined", code: charged.code }
    }
  } else {
    // 불명. 조회로만 확정한다.
    const looked = await getTossPaymentByOrderId(config, input.orderId)
    if (looked.outcome !== "succeeded") {
      return { status: "pending", code: charged.code }
    }
    payment = looked.data
  }

  const verification = verifyTossPayment(payment, {
    orderId: input.orderId,
    amount: input.amount
  })

  if (verification.verdict === "verified") {
    await applySuccess(input, verification.payment, verification.approvedAt)
    return { status: "succeeded", payment: verification.payment, approvedAt: verification.approvedAt }
  }

  if (verification.verdict === "failed") {
    await applyDecline(input, verification.code, new Date().toISOString())
    return { status: "declined", code: verification.code }
  }

  if (verification.verdict === "pending") {
    return { status: "pending", code: `payment_${verification.status.toLowerCase()}` }
  }

  // 금액/주문번호 불일치. 실패로도 성공으로도 반영하지 않는다 — 사람이 봐야 한다.
  return { status: "mismatch", code: verification.code }
}
