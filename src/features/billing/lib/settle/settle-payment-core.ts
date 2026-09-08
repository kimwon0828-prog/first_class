import { buildInitialBillingPeriod } from "@/features/billing/lib/billing-period"
import type { BillingEventResult, VerifiedBillingEvent } from "@/features/billing/lib/billing-events"
import type { BillingPaymentAttempt } from "@/features/billing/lib/charge/payment-attempt"
import { getTossPaymentByOrderId, type TossClientConfig } from "@/features/billing/lib/toss/client"
import { verifyTossPayment } from "@/features/billing/lib/toss/verify-payment"

export type StoredPaymentSettlement =
  | { status: "applied"; kind: "checkout" | "renewal"; anchorDay: number | null }
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
  return { status: "applied", kind, anchorDay: period.anchorDay }
}
