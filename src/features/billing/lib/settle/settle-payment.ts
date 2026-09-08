import "server-only"

import { applyVerifiedBillingEvent } from "@/features/billing/actions/apply-billing-event"
import { buildInitialBillingPeriod, buildRenewalBillingPeriod } from "@/features/billing/lib/billing-period"
import {
  findLatestCompletedAnchorDay,
  markCheckoutSessionCompleted,
  markCheckoutSessionFailed
} from "@/features/billing/lib/checkout/checkout-store"
import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import { getTossPaymentByOrderId, type TossClientConfig } from "@/features/billing/lib/toss/client"
import { decodeBillingOrderId, expandBillingInstant } from "@/features/billing/lib/toss/identifiers"
import { verifyTossPayment } from "@/features/billing/lib/toss/verify-payment"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// 주문번호 하나를 결제 조회로 확인하고, 확정된 결과만 반영한다.
//
// webhook 과 대사(reconciliation)가 같은 함수를 쓴다. webhook body 는 신호일 뿐이고
// 판단 근거는 언제나 조회 결과다. 그래서 위조된 webhook 으로는 아무것도 바뀌지 않는다.
//
// 반영은 applyVerifiedBillingEvent 로만 한다. 구독 테이블을 직접 고치지 않는다.
// 멱등 키는 최초 결제·갱신 때와 같은 값이라, 이미 반영된 결제는 duplicate 로 끝난다.

export type SettleOutcome =
  | { status: "applied"; kind: "checkout" | "renewal" }
  | { status: "failed_recorded"; kind: "checkout" | "renewal" }
  /** 아직 확정되지 않았다. 다음 대사에서 다시 본다. */
  | { status: "pending"; reason: string }
  /** 우리 결제가 아니거나 대조 대상이 없다. */
  | { status: "ignored"; reason: string }

type CheckoutContext = {
  kind: "checkout"
  organizationId: string
  sessionId: string
  planCode: "standard" | "pro"
  amount: number
  attemptKey: string
}

type RenewalContext = {
  kind: "renewal"
  organizationId: string
  planCode: "standard" | "pro"
  amount: number
  attemptKey: string
  periodEnd: string
}

const loadCheckoutContext = async (
  sessionId: string,
  orderId: string
): Promise<CheckoutContext | null> => {
  const client = getSupabaseServiceRoleClient()
  const { data } = await client
    .from("billing_checkout_sessions")
    .select("id, organization_id, plan_code, amount, order_id, payment_idempotency_key")
    .eq("id", sessionId)
    .maybeSingle()

  if (!data) {
    return null
  }

  const row = data as {
    id: string
    organization_id: string
    plan_code: string
    amount: number
    order_id: string
    payment_idempotency_key: string
  }

  // 주문번호가 세션의 것과 다르면 우리가 만든 주문이 아니다.
  if (row.order_id !== orderId || (row.plan_code !== "standard" && row.plan_code !== "pro")) {
    return null
  }

  return {
    kind: "checkout",
    organizationId: row.organization_id,
    sessionId: row.id,
    planCode: row.plan_code,
    amount: row.amount,
    attemptKey: row.payment_idempotency_key
  }
}

const loadRenewalContext = async (
  organizationId: string,
  periodEndCompact: string,
  attemptNumber: number
): Promise<RenewalContext | null> => {
  const periodEnd = expandBillingInstant(periodEndCompact)
  if (!periodEnd) {
    return null
  }

  const client = getSupabaseServiceRoleClient()
  const { data } = await client
    .from("organization_subscriptions")
    .select("organization_id, plan_code")
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (!data) {
    return null
  }

  const row = data as { organization_id: string; plan_code: string }
  if (row.plan_code !== "standard" && row.plan_code !== "pro") {
    return null
  }

  return {
    kind: "renewal",
    organizationId: row.organization_id,
    planCode: row.plan_code,
    amount: BILLING_PLANS[row.plan_code].amount,
    attemptKey: `renewal:${organizationId}:${periodEnd}:a${attemptNumber}`,
    periodEnd
  }
}

export const settleOrder = async (
  config: TossClientConfig,
  orderId: string
): Promise<SettleOutcome> => {
  const decoded = decodeBillingOrderId(orderId)
  if (decoded.kind === "unknown") {
    return { status: "ignored", reason: "unrecognized_order" }
  }

  const context =
    decoded.kind === "checkout"
      ? await loadCheckoutContext(decoded.checkoutSessionId, orderId)
      : await loadRenewalContext(
          decoded.organizationId,
          decoded.periodEndCompact,
          decoded.attemptNumber
        )

  if (!context) {
    return { status: "ignored", reason: "context_not_found" }
  }

  const looked = await getTossPaymentByOrderId(config, orderId)
  if (looked.outcome !== "succeeded") {
    return { status: "pending", reason: looked.code }
  }

  const verification = verifyTossPayment(looked.data, {
    orderId,
    amount: context.amount
  })

  if (verification.verdict === "mismatch") {
    return { status: "ignored", reason: verification.code }
  }

  if (verification.verdict === "pending") {
    return { status: "pending", reason: `payment_${verification.status.toLowerCase()}` }
  }

  if (verification.verdict === "failed") {
    await applyVerifiedBillingEvent({
      organizationId: context.organizationId,
      occurredAt: new Date().toISOString(),
      provider: "toss",
      type: "payment_failed",
      idempotencyKey: context.attemptKey,
      providerPaymentId: null,
      planCode: context.planCode,
      amount: context.amount,
      failureCode: verification.code
    })

    if (context.kind === "checkout") {
      await markCheckoutSessionFailed(context.sessionId, verification.code)
    }

    return { status: "failed_recorded", kind: context.kind }
  }

  const approvedAt = verification.approvedAt
  const period =
    context.kind === "checkout"
      ? buildInitialBillingPeriod(new Date(approvedAt))
      : buildRenewalBillingPeriod(
          new Date(context.periodEnd),
          await findLatestCompletedAnchorDay(context.organizationId)
        )

  await applyVerifiedBillingEvent({
    organizationId: context.organizationId,
    occurredAt: approvedAt,
    provider: "toss",
    type: context.kind === "checkout" ? "initial_payment_succeeded" : "renewal_succeeded",
    idempotencyKey: context.attemptKey,
    providerPaymentId: verification.payment.paymentKey,
    planCode: context.planCode,
    amount: context.amount,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd
  })

  if (context.kind === "checkout") {
    await markCheckoutSessionCompleted(context.sessionId, period.anchorDay)
  }

  return { status: "applied", kind: context.kind }
}
