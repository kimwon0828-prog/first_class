import "server-only"

import type { CheckoutSessionSnapshot } from "@/features/billing/lib/checkout/checkout-guards"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// checkout 세션 저장소.
//
// RLS 로는 표현할 수 없는 접근이라 service role 로 다룬다. 학원 계정이 자기 결제 의도를
// 직접 만들거나 고칠 수 있으면 금액·조직을 위조할 수 있다.

const SESSION_COLUMNS =
  "id, organization_id, customer_key, plan_code, amount, order_id, payment_idempotency_key, billing_key_issue_idempotency_key, status, expires_at, anchor_day"

type SessionRow = {
  id: string
  organization_id: string
  customer_key: string
  plan_code: string
  amount: number
  order_id: string
  payment_idempotency_key: string
  billing_key_issue_idempotency_key: string
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
  billingKeyIssueIdempotencyKey: row.billing_key_issue_idempotency_key,
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
  billingKeyIssueIdempotencyKey: string
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
    billing_key_issue_idempotency_key: input.billingKeyIssueIdempotencyKey,
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
 * 동시 실행 방어의 최종선. pending/authorized를 재개할 수 있지만 활성 lease는 하나다.
 * worker가 죽으면 lease 만료 뒤 같은 저장 identity로 다시 실행한다.
 */
export type CheckoutLease = { token: string }

const CHECKOUT_LEASE_MS = 2 * 60 * 1000

export const claimCheckoutSession = async (
  sessionId: string,
  now: Date = new Date()
): Promise<CheckoutLease | null> => {
  const client = getSupabaseServiceRoleClient()
  const token = crypto.randomUUID()
  const { data, error } = await client
    .from("billing_checkout_sessions")
    .update({
      status: "authorized",
      authorized_at: now.toISOString(),
      processing_token: token,
      processing_started_at: now.toISOString()
    })
    .eq("id", sessionId)
    .in("status", ["pending", "authorized"])
    .or(
      `processing_started_at.is.null,processing_started_at.lt.${new Date(now.getTime() - CHECKOUT_LEASE_MS).toISOString()}`
    )
    .select("id")

  if (error) {
    throw new Error("failed_to_claim_checkout_session")
  }

  return (data ?? []).length === 1 ? { token } : null
}

export const releaseCheckoutSession = async (sessionId: string, lease: CheckoutLease) => {
  const client = getSupabaseServiceRoleClient()
  const { error } = await client
    .from("billing_checkout_sessions")
    .update({ processing_token: null, processing_started_at: null })
    .eq("id", sessionId)
    .eq("processing_token", lease.token)
  if (error) throw new Error("failed_to_release_checkout_session")
}

export const markCheckoutSessionCompleted = async (
  sessionId: string,
  anchorDay: number,
  lease?: CheckoutLease
) => {
  const client = getSupabaseServiceRoleClient()
  let query = client
    .from("billing_checkout_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      anchor_day: anchorDay,
      processing_token: null,
      processing_started_at: null
    })
    .eq("id", sessionId)
  if (lease) query = query.eq("processing_token", lease.token)
  const { data, error } = await query.select("id")
  if (error || (lease && (data ?? []).length !== 1)) {
    throw new Error("failed_to_complete_checkout_session")
  }
}

export const markCheckoutSessionFailed = async (
  sessionId: string,
  failureCode: string,
  lease?: CheckoutLease
) => {
  const client = getSupabaseServiceRoleClient()
  let query = client
    .from("billing_checkout_sessions")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_code: failureCode,
      processing_token: null,
      processing_started_at: null
    })
    .eq("id", sessionId)
  if (lease) query = query.eq("processing_token", lease.token)
  const { data, error } = await query.select("id")
  if (error || (lease && (data ?? []).length !== 1)) {
    throw new Error("failed_to_fail_checkout_session")
  }
}
