import "server-only"

import type { CheckoutSessionSnapshot } from "@/features/billing/lib/checkout/checkout-guards"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// checkout 세션 저장소.
//
// RLS 로는 표현할 수 없는 접근이라 service role 로 다룬다. 학원 계정이 자기 결제 의도를
// 직접 만들거나 고칠 수 있으면 금액·조직을 위조할 수 있다.

const SESSION_COLUMNS =
  "id, organization_id, customer_key, plan_code, amount, order_id, payment_idempotency_key, status, expires_at, anchor_day"

type SessionRow = {
  id: string
  organization_id: string
  customer_key: string
  plan_code: string
  amount: number
  order_id: string
  payment_idempotency_key: string
  status: string
  expires_at: string
}

const toSnapshot = (row: SessionRow): CheckoutSessionSnapshot => ({
  id: row.id,
  organizationId: row.organization_id,
  customerKey: row.customer_key,
  planCode: row.plan_code,
  amount: row.amount,
  orderId: row.order_id,
  paymentIdempotencyKey: row.payment_idempotency_key,
  status: row.status,
  expiresAt: row.expires_at
})

export const insertCheckoutSession = async (input: {
  id: string
  organizationId: string
  customerKey: string
  planCode: string
  amount: number
  orderId: string
  paymentIdempotencyKey: string
  requestedBy: string
  expiresAt: string
}) => {
  const client = getSupabaseServiceRoleClient()
  const { error } = await client.from("billing_checkout_sessions").insert({
    id: input.id,
    organization_id: input.organizationId,
    provider: "toss",
    customer_key: input.customerKey,
    plan_code: input.planCode,
    amount: input.amount,
    order_id: input.orderId,
    payment_idempotency_key: input.paymentIdempotencyKey,
    status: "pending",
    requested_by: input.requestedBy,
    expires_at: input.expiresAt
  })

  if (error) {
    throw new Error("failed_to_create_checkout_session")
  }
}

export const findCheckoutSessionByCustomerKey = async (
  customerKey: string
): Promise<CheckoutSessionSnapshot | null> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("billing_checkout_sessions")
    .select(SESSION_COLUMNS)
    .eq("provider", "toss")
    .eq("customer_key", customerKey)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_read_checkout_session")
  }

  return data ? toSnapshot(data as SessionRow) : null
}

/**
 * 재생(replay) 방어의 최종선.
 *
 * pending → authorized 로 옮길 수 있는 요청은 하나뿐이다. 같은 callback 이 동시에
 * 두 번 들어와도 두 번째는 0행을 받고 멈춘다.
 */
export const claimCheckoutSession = async (sessionId: string): Promise<boolean> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("billing_checkout_sessions")
    .update({ status: "authorized", authorized_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("status", "pending")
    .select("id")

  if (error) {
    throw new Error("failed_to_claim_checkout_session")
  }

  return (data ?? []).length === 1
}

export const markCheckoutSessionCompleted = async (sessionId: string, anchorDay: number) => {
  const client = getSupabaseServiceRoleClient()
  await client
    .from("billing_checkout_sessions")
    .update({ status: "completed", completed_at: new Date().toISOString(), anchor_day: anchorDay })
    .eq("id", sessionId)
}

export const markCheckoutSessionFailed = async (sessionId: string, failureCode: string) => {
  const client = getSupabaseServiceRoleClient()
  await client
    .from("billing_checkout_sessions")
    .update({ status: "failed", failed_at: new Date().toISOString(), failure_code: failureCode })
    .eq("id", sessionId)
}

/** 갱신 기준일. checkout 으로 시작한 구독에만 있다. */
export const findLatestCompletedAnchorDay = async (
  organizationId: string
): Promise<number | null> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("billing_checkout_sessions")
    .select("anchor_day")
    .eq("organization_id", organizationId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return (data as { anchor_day: number | null }).anchor_day
}
