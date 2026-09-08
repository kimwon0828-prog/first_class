import "server-only"

import { applyVerifiedBillingEvent } from "@/features/billing/actions/apply-billing-event"
import { findBillingPaymentAttemptByOrderId } from "@/features/billing/lib/charge/payment-attempt"
import {
  markCheckoutSessionCompleted,
  markCheckoutSessionFailed
} from "@/features/billing/lib/checkout/checkout-store"
import type { TossClientConfig } from "@/features/billing/lib/toss/client"
import { settleStoredPayment } from "@/features/billing/lib/settle/settle-payment-core"

// webhook과 reconciliation은 provider body나 재계산한 주문번호가 아니라, POST 전에
// 저장한 payment attempt를 canonical context로 사용한다.

export type SettleOutcome =
  | { status: "applied"; kind: "checkout" | "renewal" }
  /** 이미 반영돼 있었다. DB mutation 0. */
  | { status: "duplicate"; kind: "checkout" | "renewal" }
  /** 더 최신 이벤트가 이미 반영돼 있었다. DB mutation 0. */
  | { status: "stale"; kind: "checkout" | "renewal" }
  | { status: "failed_recorded"; kind: "checkout" | "renewal" }
  | { status: "pending"; reason: string }
  | { status: "ignored"; reason: string }

export const settleOrder = async (
  config: TossClientConfig,
  orderId: string
): Promise<SettleOutcome> => {
  const attempt = await findBillingPaymentAttemptByOrderId(orderId)
  if (!attempt) return { status: "ignored", reason: "attempt_not_found" }

  const settled = await settleStoredPayment(config, attempt, applyVerifiedBillingEvent)
  if (settled.status === "applied" || settled.status === "duplicate") {
    // 이미 반영된 결제여도 세션이 열려 있으면 닫는다(마감 자체는 멱등하다).
    if (attempt.checkoutSessionId && settled.anchorDay) {
      await markCheckoutSessionCompleted(attempt.checkoutSessionId, settled.anchorDay)
    }
    return { status: settled.status, kind: settled.kind }
  }
  if (settled.status === "stale") {
    return { status: "stale", kind: settled.kind }
  }
  if (settled.status === "failed_recorded") {
    if (attempt.checkoutSessionId) {
      await markCheckoutSessionFailed(attempt.checkoutSessionId, settled.failureCode)
    }
    return { status: "failed_recorded", kind: settled.kind }
  }
  return settled
}
