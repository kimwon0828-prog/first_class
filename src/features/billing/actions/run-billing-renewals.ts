import "server-only"

import { applyVerifiedBillingEvent } from "@/features/billing/actions/apply-billing-event"
import { buildRenewalBillingPeriod } from "@/features/billing/lib/billing-period"
import { chargeSubscription } from "@/features/billing/lib/charge/charge-subscription"
import { ensureBillingPaymentAttempt } from "@/features/billing/lib/charge/payment-attempt"
import { markBillingKeyInvalid } from "@/features/billing/lib/checkout/billing-customer-store"
import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import { decideRenewal } from "@/features/billing/lib/renewal/renewal-schedule"
import { findRenewalCandidates } from "@/features/billing/lib/renewal/renewal-candidates"
import { buildBillingOrderName, buildRenewalBillingAttempt } from "@/features/billing/lib/toss/identifiers"
import { getTossRuntime } from "@/features/billing/lib/toss/server"

// 갱신 결제 실행(Cron).
//
// 결정적으로 동작한다. 같은 (조직, 기간, 차수)면 언제 돌려도 같은 주문번호·멱등키를 쓰므로
// Cron 이 중복 실행되거나 Vercel 이 재시도해도 결제는 한 번이다.
//
// 결과를 모르면(timeout 등) 아무것도 반영하지 않는다. 대사가 마무리한다.

export type RenewalRunSummary = {
  scanned: number
  charged: number
  declined: number
  pending: number
  mismatched: number
  skipped: number
}

/** 빌링키 자체가 무효라고 Toss 가 알려 주는 경우. 재시도해도 소용없다. */
const BILLING_KEY_INVALID_CODES = new Set([
  "NOT_FOUND_BILLING_KEY",
  "INVALID_BILLING_KEY",
  "UNAUTHORIZED_KEY",
  "INVALID_CARD_EXPIRATION",
  "INVALID_STOPPED_CARD"
])

export const runBillingRenewals = async (now: Date = new Date()): Promise<RenewalRunSummary> => {
  const runtime = getTossRuntime()
  if (runtime.status !== "ready") {
    throw new Error("toss_billing_not_configured")
  }

  const candidates = await findRenewalCandidates(now)
  const summary: RenewalRunSummary = {
    scanned: candidates.length,
    charged: 0,
    declined: 0,
    pending: 0,
    mismatched: 0,
    skipped: 0
  }

  for (const candidate of candidates) {
    const decision = decideRenewal(candidate, now)
    if (!decision.due || !candidate.currentPeriodEnd) {
      summary.skipped += 1
      continue
    }

    const plan = BILLING_PLANS[candidate.planCode]
    if (!plan || plan.amount <= 0) {
      // 판매하지 않는 플랜에 청구하지 않는다.
      summary.skipped += 1
      continue
    }

    const periodEnd = candidate.currentPeriodEnd
    const attempt = buildRenewalBillingAttempt(
      candidate.organizationId,
      periodEnd,
      decision.attemptNumber
    )
    const period = buildRenewalBillingPeriod(new Date(periodEnd), candidate.billingAnchorDay)

    const result = await chargeSubscription(runtime.config, {
      organizationId: candidate.organizationId,
      billingKey: candidate.billingKey,
      customerKey: candidate.customerKey,
      planCode: candidate.planCode,
      amount: plan.amount,
      orderId: attempt.orderId,
      orderName: buildBillingOrderName(plan.name),
      idempotencyKey: attempt.idempotencyKey,
      attemptKey: attempt.attemptKey,
      attemptKind: "renewal",
      attemptNumber: decision.attemptNumber,
      checkoutSessionId: null,
      attemptPeriod: period,
      eventType: "renewal_succeeded",
      // 갱신 기간은 승인 시각이 아니라 직전 기간에서 이어진다. 결제일이 밀리지 않는다.
      resolvePeriod: () => ({ periodStart: period.periodStart, periodEnd: period.periodEnd }),
      applyEvent: applyVerifiedBillingEvent,
      ensureAttempt: ensureBillingPaymentAttempt
    })

    if (result.status === "succeeded") {
      summary.charged += 1
      continue
    }

    if (result.status === "declined") {
      summary.declined += 1
      if (BILLING_KEY_INVALID_CODES.has(result.code)) {
        // 카드가 아예 못 쓰는 상태다. 재시도 대신 결제수단을 무효로 표시한다.
        await markBillingKeyInvalid(candidate.organizationId)
        await applyVerifiedBillingEvent({
          organizationId: candidate.organizationId,
          occurredAt: now.toISOString(),
          provider: "toss",
          type: "billing_method_invalid",
          failureCode: result.code
        })
      }
      continue
    }

    if (result.status === "pending") {
      summary.pending += 1
      continue
    }

    summary.mismatched += 1
  }

  return summary
}
