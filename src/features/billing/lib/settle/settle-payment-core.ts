import { buildInitialBillingPeriod } from "@/features/billing/lib/billing-period"
import type { BillingEventResult, VerifiedBillingEvent } from "@/features/billing/lib/billing-events"
import type { BillingPaymentAttempt } from "@/features/billing/lib/charge/payment-attempt"
import { getTossPaymentByOrderId, type TossClientConfig } from "@/features/billing/lib/toss/client"
import { verifyTossPayment } from "@/features/billing/lib/toss/verify-payment"

/**
 * 대사·webhook 정산 결과.
 *
 * ⚠️ status 는 apply_billing_event 가 실제로 한 일과 같아야 한다.
 *    이미 반영된 결제를 다시 정산하면 DB 는 아무것도 쓰지 않는데(duplicate)
 *    결과만 "applied" 로 보고하면 운영 로그와 대사 판단이 거짓이 된다.
 */
export type StoredPaymentSettlement =
  /** 이번 호출이 실제로 반영했다. */
  | { status: "applied"; kind: "checkout" | "renewal"; anchorDay: number | null }
  /** 이미 반영돼 있었다. 이번 호출은 아무것도 쓰지 않았다. */
  | { status: "duplicate"; kind: "checkout" | "renewal"; anchorDay: number | null }
  /** 더 최신 이벤트가 이미 반영돼 있었다. */
  | { status: "stale"; kind: "checkout" | "renewal" }
  | { status: "failed_recorded"; kind: "checkout" | "renewal"; failureCode: string }
  | { status: "pending"; reason: string }
  | { status: "ignored"; reason: string }

export const settleStoredPayment = async (
  config: TossClientConfig,
  attempt: BillingPaymentAttempt,
  applyEvent: (event: VerifiedBillingEvent) => Promise<BillingEventResult>
): Promise<StoredPaymentSettlement> => {
  const kind = attempt.attemptKind === "initial" ? "checkout" : "renewal"
  const looked = await getTossPaymentByOrderId(config, attempt.orderId)
  if (looked.outcome !== "succeeded") return { status: "pending", reason: looked.code }

  const verification = verifyTossPayment(looked.data, {
    orderId: attempt.orderId,
    amount: attempt.amount
  })
  if (verification.verdict === "mismatch") return { status: "ignored", reason: verification.code }
  if (verification.verdict === "pending") {
    return { status: "pending", reason: `payment_${verification.status.toLowerCase()}` }
  }

  const eventAttempt = {
    providerOrderId: attempt.orderId,
    providerIdempotencyKey: attempt.providerIdempotencyKey,
    attemptKind: attempt.attemptKind,
    attemptNumber: attempt.attemptNumber,
    checkoutSessionId: attempt.checkoutSessionId,
    billingAnchorDay: attempt.anchorDay
  }

  if (verification.verdict === "failed") {
    const result = await applyEvent({
      organizationId: attempt.organizationId,
      occurredAt: new Date().toISOString(),
      provider: "toss",
      type: "payment_failed",
      idempotencyKey: attempt.attemptKey,
      providerPaymentId: null,
      planCode: attempt.planCode,
      amount: attempt.amount,
      failureCode: verification.code,
      attempt: eventAttempt
    })
    if (result.mode === "terminal_conflict") {
      return { status: "ignored", reason: `terminal_${result.status}` }
    }
    if (result.mode === "duplicate") {
      return { status: "duplicate", kind, anchorDay: null }
    }
    if (result.mode === "stale") {
      return { status: "stale", kind }
    }
    if (result.mode === "ignored") {
      return { status: "ignored", reason: result.reason }
    }
    return { status: "failed_recorded", kind, failureCode: verification.code }
  }

  const period =
    attempt.attemptKind === "initial"
      ? buildInitialBillingPeriod(new Date(verification.approvedAt))
      : {
          periodStart: attempt.periodStart,
          periodEnd: attempt.periodEnd,
          anchorDay: attempt.anchorDay
        }
  const result = await applyEvent({
    organizationId: attempt.organizationId,
    occurredAt: verification.approvedAt,
    provider: "toss",
    type: attempt.attemptKind === "initial" ? "initial_payment_succeeded" : "renewal_succeeded",
    idempotencyKey: attempt.attemptKey,
    providerPaymentId: verification.payment.paymentKey,
    planCode: attempt.planCode,
    amount: attempt.amount,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    attempt: { ...eventAttempt, billingAnchorDay: period.anchorDay }
  })
  if (result.mode === "terminal_conflict") {
    return { status: "ignored", reason: `terminal_${result.status}` }
  }
  if (result.mode === "duplicate") {
    // 이미 반영된 결제다. 세션 마감 같은 후속 정리는 그대로 하되, 반영했다고 보고하지 않는다.
    return { status: "duplicate", kind, anchorDay: period.anchorDay }
  }
  if (result.mode === "stale") {
    return { status: "stale", kind }
  }
  if (result.mode === "ignored") {
    return { status: "ignored", reason: result.reason }
  }
  return { status: "applied", kind, anchorDay: period.anchorDay }
}
