import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export type BillingAttemptKind = "initial" | "renewal"

export type BillingPaymentAttempt = {
  id: string
  organizationId: string
  provider: "toss"
  orderId: string
  providerIdempotencyKey: string
  attemptKey: string
  attemptKind: BillingAttemptKind
  attemptNumber: number
  checkoutSessionId: string | null
  planCode: "standard" | "pro"
  amount: number
  periodStart: string
  periodEnd: string
  anchorDay: number | null
  status: "pending" | "succeeded" | "failed"
  providerPaymentId: string | null
  paidAt: string | null
  failureCode: string | null
}

export type BillingPaymentAttemptInput = Omit<
  BillingPaymentAttempt,
  "id" | "status" | "providerPaymentId" | "paidAt" | "failureCode"
>

type PaymentRow = {
  id: string
  organization_id: string
  provider: string
  provider_order_id: string
  provider_idempotency_key: string
  idempotency_key: string
  attempt_kind: string
  attempt_number: number | null
  checkout_session_id: string | null
  plan_code: string
  amount: number
  period_start: string
  period_end: string
  billing_anchor_day: number | null
  status: string
  provider_payment_id: string | null
  paid_at: string | null
  failure_code: string | null
}

const PAYMENT_COLUMNS = [
  "id",
  "organization_id",
  "provider",
  "provider_order_id",
  "provider_idempotency_key",
  "idempotency_key",
  "attempt_kind",
  "attempt_number",
  "checkout_session_id",
  "plan_code",
  "amount",
  "period_start",
  "period_end",
  "billing_anchor_day",
  "status",
  "provider_payment_id",
  "paid_at",
  "failure_code"
].join(",")

const toAttempt = (row: PaymentRow): BillingPaymentAttempt => ({
  id: row.id,
  organizationId: row.organization_id,
  provider: "toss",
  orderId: row.provider_order_id,
  providerIdempotencyKey: row.provider_idempotency_key,
  attemptKey: row.idempotency_key,
  attemptKind: row.attempt_kind as BillingAttemptKind,
  attemptNumber: row.attempt_number ?? 0,
  checkoutSessionId: row.checkout_session_id,
  planCode: row.plan_code as "standard" | "pro",
  amount: row.amount,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  anchorDay: row.billing_anchor_day,
  status: row.status as BillingPaymentAttempt["status"],
  providerPaymentId: row.provider_payment_id,
  paidAt: row.paid_at,
  failureCode: row.failure_code
})

const sameIdentity = (stored: BillingPaymentAttempt, input: BillingPaymentAttemptInput) =>
  stored.organizationId === input.organizationId &&
  stored.provider === input.provider &&
  stored.orderId === input.orderId &&
  stored.providerIdempotencyKey === input.providerIdempotencyKey &&
  stored.attemptKey === input.attemptKey &&
  stored.attemptKind === input.attemptKind &&
  stored.attemptNumber === input.attemptNumber &&
  stored.checkoutSessionId === input.checkoutSessionId &&
  stored.planCode === input.planCode &&
  stored.amount === input.amount &&
  (stored.status !== "pending" ||
    (stored.periodStart === input.periodStart &&
      stored.periodEnd === input.periodEnd &&
      stored.anchorDay === input.anchorDay))

export const ensureBillingPaymentAttempt = async (
  input: BillingPaymentAttemptInput
): Promise<BillingPaymentAttempt> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("organization_payments")
    .insert({
      organization_id: input.organizationId,
      provider: input.provider,
      provider_order_id: input.orderId,
      provider_idempotency_key: input.providerIdempotencyKey,
      idempotency_key: input.attemptKey,
      attempt_kind: input.attemptKind,
      attempt_number: input.attemptNumber,
      checkout_session_id: input.checkoutSessionId,
      billing_anchor_day: input.anchorDay,
      plan_code: input.planCode,
      amount: input.amount,
      status: "pending",
      period_start: input.periodStart,
      period_end: input.periodEnd
    })
    .select(PAYMENT_COLUMNS)
    .single()

  if (!error && data) {
    return toAttempt(data as unknown as PaymentRow)
  }

  if (error?.code !== "23505") {
    throw new Error("failed_to_create_payment_attempt")
  }

  const { data: existing, error: readError } = await client
    .from("organization_payments")
    .select(PAYMENT_COLUMNS)
    .eq("idempotency_key", input.attemptKey)
    .maybeSingle()

  if (readError || !existing) {
    throw new Error("billing_payment_attempt_conflict")
  }

  const attempt = toAttempt(existing as unknown as PaymentRow)
  if (!sameIdentity(attempt, input)) {
    throw new Error("billing_payment_attempt_conflict")
  }

  return attempt
}

export const findBillingPaymentAttemptByOrderId = async (
  orderId: string
): Promise<BillingPaymentAttempt | null> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("organization_payments")
    .select(PAYMENT_COLUMNS)
    .eq("provider", "toss")
    .eq("provider_order_id", orderId)
    .maybeSingle()

  if (error) throw new Error("failed_to_read_payment_attempt")
  return data ? toAttempt(data as unknown as PaymentRow) : null
}

export const findPendingBillingPaymentAttempts = async (
  olderThan: Date,
  limit = 200
): Promise<BillingPaymentAttempt[]> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("organization_payments")
    .select(PAYMENT_COLUMNS)
    .eq("provider", "toss")
    .eq("status", "pending")
    .lte("created_at", olderThan.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit)

  if (error) throw new Error("failed_to_read_pending_payment_attempts")
  return ((data ?? []) as unknown as PaymentRow[]).map(toAttempt)
}
