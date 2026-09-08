// provider 와 무관한 결제 도메인 이벤트.
//
// PG 원문 상태(예: DONE / ABORTED / CANCELED)는 여기까지 오지 않는다.
// provider adapter 가 이 타입으로 정규화하고, 상태 전이는 오직
// applyVerifiedBillingEvent 하나가 수행한다.
//
// "verified" 는 우리가 provider API 로 확인했다는 뜻이다.
// 클라이언트가 "결제 성공" 이라고 말한 값만으로 이 이벤트를 만들지 않는다.

import type { BillingProvider, OrganizationPaidPlanCode } from "@/shared/lib/db/adapter"

export type BillingEventType =
  | "initial_payment_succeeded"
  | "renewal_succeeded"
  | "payment_failed"
  | "billing_method_invalid"
  | "cancel_scheduled"
  | "cancel_schedule_reverted"
  | "immediate_canceled"
  | "period_expired"

type BillingEventBase = {
  organizationId: string
  /** provider 가 기록한 발생 시각. 늦게 도착한 과거 이벤트를 거르는 기준이다. */
  occurredAt: string
  provider: BillingProvider
}

type PaymentAttemptIdentity = {
  providerOrderId: string
  providerIdempotencyKey: string
  attemptKind: "initial" | "renewal"
  attemptNumber: number
  checkoutSessionId: string | null
  billingAnchorDay: number | null
}

export type VerifiedBillingEvent = BillingEventBase &
  (
    | {
        type: "initial_payment_succeeded" | "renewal_succeeded"
        /** 같은 결제가 두 번 반영되지 않게 하는 키. */
        idempotencyKey: string
        providerPaymentId: string
        planCode: OrganizationPaidPlanCode
        /** 서버 canonical 가격. 클라이언트 금액을 그대로 넣지 않는다. */
        amount: number
        periodStart: string
        periodEnd: string
        attempt: PaymentAttemptIdentity
      }
    | {
        type: "payment_failed"
        idempotencyKey: string
        providerPaymentId: string | null
        planCode: OrganizationPaidPlanCode
        amount: number
        failureCode: string | null
        attempt: PaymentAttemptIdentity
      }
    | {
        type: "billing_method_invalid"
        failureCode: string | null
      }
    | { type: "cancel_scheduled" | "cancel_schedule_reverted" | "immediate_canceled" }
    | { type: "period_expired" }
  )

export type BillingEventResult =
  /** 실제로 반영됐다. */
  | { mode: "applied"; status: string; currentPeriodEnd: string | null }
  /** 같은 결제가 이미 반영돼 있었다. 아무것도 쓰지 않았다. */
  | { mode: "duplicate" }
  /** 더 최신 이벤트가 이미 반영돼 있어 무시했다. */
  | { mode: "stale" }
  /** 검증 근거가 부족해 반대 terminal 결과를 자동으로 뒤집지 않았다. */
  | { mode: "terminal_conflict"; status: string }
  /** 대상 구독이 없어 무시했다. */
  | { mode: "ignored"; reason: string }

/** RPC 인자로 바꾼다. 도메인 타입과 DB 인자 이름의 매핑은 이 함수만 안다. */
export const toBillingEventArgs = (event: VerifiedBillingEvent) => ({
  p_organization_id: event.organizationId,
  p_event_type: event.type,
  p_event_at: event.occurredAt,
  p_provider: event.provider,
  p_idempotency_key: "idempotencyKey" in event ? event.idempotencyKey : null,
  p_provider_payment_id: "providerPaymentId" in event ? event.providerPaymentId : null,
  p_plan_code: "planCode" in event ? event.planCode : "standard",
  p_amount: "amount" in event ? event.amount : null,
  p_period_start: "periodStart" in event ? event.periodStart : null,
  p_period_end: "periodEnd" in event ? event.periodEnd : null,
  // 유예 종료 시각은 넘기지 않는다. 잠근 구독 행을 보고 DB 가 정한다.
  p_failure_code: "failureCode" in event ? event.failureCode : null,
  p_provider_order_id: "attempt" in event ? event.attempt.providerOrderId : null,
  p_provider_idempotency_key: "attempt" in event ? event.attempt.providerIdempotencyKey : null,
  p_attempt_kind: "attempt" in event ? event.attempt.attemptKind : null,
  p_attempt_number: "attempt" in event ? event.attempt.attemptNumber : null,
  p_checkout_session_id: "attempt" in event ? event.attempt.checkoutSessionId : null,
  p_billing_anchor_day: "attempt" in event ? event.attempt.billingAnchorDay : null
})
