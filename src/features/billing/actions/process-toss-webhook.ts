import "server-only"

import { markBillingKeyInvalid } from "@/features/billing/lib/checkout/billing-customer-store"
import { settleOrder } from "@/features/billing/lib/settle/settle-payment"
import { getTossRuntime } from "@/features/billing/lib/toss/server"
import {
  HANDLED_WEBHOOK_EVENTS,
  parseTossWebhook,
  type TossWebhookEnvelope
} from "@/features/billing/lib/webhook/webhook-contract"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// Toss webhook 처리.
//
// body 로 구독을 바꾸지 않는다. orderId 만 꺼내 결제 조회 API 로 다시 읽고,
// 그 결과로만 반영한다(settleOrder). 위조된 body 로는 아무 일도 일어나지 않는다.
//
// 응답 정책.
//   중복·무관·이미 처리 → 200 (재전송을 멈춘다)
//   우리 쪽 오류        → 500 (재전송을 받아 다시 시도한다)

export type WebhookProcessResult = {
  /** 이 값이 그대로 HTTP 상태가 된다. */
  httpStatus: number
  outcome: string
}

const OK = (outcome: string): WebhookProcessResult => ({ httpStatus: 200, outcome })

const recordEvent = async (
  envelope: TossWebhookEnvelope,
  organizationId: string | null
): Promise<"new" | "duplicate"> => {
  const client = getSupabaseServiceRoleClient()
  const { error } = await client.from("billing_webhook_events").insert({
    provider: "toss",
    provider_event_id: envelope.eventId,
    event_type: envelope.eventType,
    provider_created_at: envelope.createdAt,
    organization_id: organizationId,
    provider_payment_id: envelope.paymentKey,
    processing_status: "received"
  })

  if (!error) {
    return "new"
  }

  // (provider, provider_event_id) 유일 제약. 같은 webhook 이 다시 온 것이다.
  if (error.code === "23505") {
    return "duplicate"
  }

  throw new Error("failed_to_record_webhook_event")
}

const finishEvent = async (eventId: string, status: string, errorCode: string | null) => {
  const client = getSupabaseServiceRoleClient()
  await client
    .from("billing_webhook_events")
    .update({ processing_status: status, processed_at: new Date().toISOString(), error_code: errorCode })
    .eq("provider", "toss")
    .eq("provider_event_id", eventId)
}

export const processTossWebhook = async (
  rawBody: unknown,
  transmissionId: string | null
): Promise<WebhookProcessResult> => {
  const parsed = parseTossWebhook(rawBody, transmissionId)
  if (!parsed.ok) {
    // 우리가 이해하지 못하는 형태다. 재전송받아도 결과는 같으므로 200 으로 소비한다.
    return OK(`ignored:${parsed.reason}`)
  }

  const envelope = parsed.envelope

  // 중복 판정을 먼저 한다 — 조회 API 를 불필요하게 부르지 않는다.
  const recorded = await recordEvent(envelope, null)
  if (recorded === "duplicate") {
    return OK("duplicate")
  }

  if (!HANDLED_WEBHOOK_EVENTS.has(envelope.eventType)) {
    await finishEvent(envelope.eventId, "ignored", "unhandled_event_type")
    return OK("ignored:unhandled_event_type")
  }

  const runtime = getTossRuntime()
  if (runtime.status !== "ready") {
    // 우리 설정 문제다. 재전송을 받아야 한다.
    await finishEvent(envelope.eventId, "failed", "toss_not_configured")
    return { httpStatus: 500, outcome: "toss_not_configured" }
  }

  if (envelope.eventType === "BILLING_DELETED") {
    // 빌링키가 사라졌다. 자동 갱신을 멈추되 구독을 닫지는 않는다 —
    // 이미 결제된 기간은 그대로 쓴다. 다음 갱신에서 실패로 처리된다.
    await finishEvent(envelope.eventId, "processed", null)
    return OK("billing_key_deleted")
  }

  if (!envelope.orderId) {
    await finishEvent(envelope.eventId, "ignored", "missing_order_id")
    return OK("ignored:missing_order_id")
  }

  try {
    const settled = await settleOrder(runtime.config, envelope.orderId)
    await finishEvent(
      envelope.eventId,
      settled.status === "applied" || settled.status === "failed_recorded"
        ? "processed"
        : settled.status === "pending"
          ? "received"
          : "ignored",
      settled.status === "applied" ? null : ("reason" in settled ? settled.reason : null)
    )

    if (settled.status === "pending") {
      // 아직 확정되지 않았다. 재전송을 받아 다시 확인한다.
      return { httpStatus: 500, outcome: `pending:${settled.reason}` }
    }

    return OK(settled.status)
  } catch (error) {
    await finishEvent(envelope.eventId, "failed", "settle_failed")
    throw error
  }
}

/** BILLING_DELETED 후속 처리용. 지금은 갱신 경로에서만 쓴다. */
export const invalidateBillingKey = markBillingKeyInvalid
