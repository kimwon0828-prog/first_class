import "server-only"

import type { RenewalSubject } from "@/features/billing/lib/renewal/renewal-schedule"
import type { TrialFirstChargeSubject } from "@/features/billing/lib/standard-trial"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// 갱신 대상 조회.
//
// 선정 기준은 구독과 결제수단뿐이다.
//   - 구독이 있고 유료 플랜이며 active | past_due
//   - 해지 예약이 아니고 이용기간이 끝났다
//   - 활성 빌링키가 있다
//
// 내부 전체 권한(override)은 선정 기준이 아니다. override 는 결제 없이 기능을 여는
// 장치이므로, 그것을 보고 결제를 시도하면 결제하지 않기로 한 조직에 청구하게 된다.
// 반대로 내부 조직이 실제로 결제했다면 구독과 빌링키가 있으므로 정상적으로 갱신된다.
//
// 수동 trialing(씨큐브 PoC)은 status 로도, 빌링키 없음으로도 제외된다.
//
// 자동 체험(승인 90일)의 첫 결제는 findTrialFirstChargeCandidates 가 따로 고른다.
//   - trialing · trial_origin = signup_approval · 해지 예약 아님
//   - 종료 시각이 24시간 안(= 마지막 체험일 KST)이고 아직 지나지 않았다
//   - 활성 빌링키가 있다
//   - 자동 결제 동의(register_card 세션 완료)가 종료 30일 전 ~ 종료 안에 있다
// 마지막 두 조건 · 날짜 경계의 최종 판정은 decideTrialFirstCharge(standard-trial.ts)가 한다.

const CANDIDATE_LIMIT = 200

export type RenewalCandidate = RenewalSubject & {
  organizationId: string
  planCode: "standard" | "pro"
  billingKey: string
  customerKey: string
  billingAnchorDay: number | null
}

type SubscriptionRow = {
  organization_id: string
  plan_code: string
  subscription_status: string
  current_period_end: string | null
  grace_period_end: string | null
  cancel_at_period_end: boolean
  billing_anchor_day: number | null
}

type CustomerRow = {
  organization_id: string
  provider_customer_key: string
  billing_key: string
}

export const findRenewalCandidates = async (now: Date): Promise<RenewalCandidate[]> => {
  const client = getSupabaseServiceRoleClient()

  const { data: subscriptions, error } = await client
    .from("organization_subscriptions")
    .select(
      "organization_id, plan_code, subscription_status, current_period_end, grace_period_end, cancel_at_period_end, billing_anchor_day"
    )
    .in("subscription_status", ["active", "past_due"])
    .eq("cancel_at_period_end", false)
    .lte("current_period_end", now.toISOString())
    .order("current_period_end", { ascending: true })
    .limit(CANDIDATE_LIMIT)

  if (error) {
    throw new Error("failed_to_read_renewal_candidates")
  }

  const rows = (subscriptions ?? []) as SubscriptionRow[]
  if (rows.length === 0) {
    return []
  }

  // 빌링키가 없는 조직은 자동결제 대상이 아니다.
  const { data: customers, error: customerError } = await client
    .from("organization_billing_customers")
    .select("organization_id, provider_customer_key, billing_key")
    .eq("provider", "toss")
    .eq("billing_key_status", "active")
    .in(
      "organization_id",
      rows.map((row) => row.organization_id)
    )

  if (customerError) {
    throw new Error("failed_to_read_billing_customers")
  }

  const byOrganization = new Map(
    ((customers ?? []) as CustomerRow[]).map((row) => [row.organization_id, row])
  )

  return rows.flatMap((row) => {
    const customer = byOrganization.get(row.organization_id)
    if (!customer || (row.plan_code !== "standard" && row.plan_code !== "pro")) {
      return []
    }

    return [
      {
        organizationId: row.organization_id,
        planCode: row.plan_code,
        subscriptionStatus: row.subscription_status,
        currentPeriodEnd: row.current_period_end,
        gracePeriodEnd: row.grace_period_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        billingKey: customer.billing_key,
        customerKey: customer.provider_customer_key,
        billingAnchorDay: row.billing_anchor_day
      }
    ]
  })
}

export type TrialFirstChargeCandidate = TrialFirstChargeSubject & {
  organizationId: string
  planCode: "standard"
  billingKey: string | null
  customerKey: string | null
}

type TrialSubscriptionRow = {
  organization_id: string
  plan_code: string
  subscription_status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  trial_origin: string | null
  trial_ends_at: string | null
}

type ConsentRow = {
  organization_id: string
  completed_at: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

export const findTrialFirstChargeCandidates = async (now: Date): Promise<TrialFirstChargeCandidate[]> => {
  const client = getSupabaseServiceRoleClient()

  const { data: subscriptions, error } = await client
    .from("organization_subscriptions")
    .select("organization_id, plan_code, subscription_status, current_period_end, cancel_at_period_end, trial_origin, trial_ends_at")
    .eq("subscription_status", "trialing")
    .eq("trial_origin", "signup_approval")
    // 해지 예약은 어떤 경우에도 결제하지 않는다(decideTrialFirstCharge 도 다시 본다).
    .eq("cancel_at_period_end", false)
    .gt("trial_ends_at", now.toISOString())
    .lte("trial_ends_at", new Date(now.getTime() + DAY_MS).toISOString())
    .order("trial_ends_at", { ascending: true })
    .limit(CANDIDATE_LIMIT)

  if (error) {
    throw new Error("failed_to_read_trial_first_charge_candidates")
  }

  const rows = ((subscriptions ?? []) as TrialSubscriptionRow[]).filter((row) => row.plan_code === "standard")
  if (rows.length === 0) {
    return []
  }

  const organizationIds = rows.map((row) => row.organization_id)
  const [customersResult, consentResult] = await Promise.all([
    client
      .from("organization_billing_customers")
      .select("organization_id, provider_customer_key, billing_key")
      .eq("provider", "toss")
      .eq("billing_key_status", "active")
      .in("organization_id", organizationIds),
    client
      .from("billing_checkout_sessions")
      .select("organization_id, completed_at")
      .eq("status", "completed")
      .eq("purpose", "register_card")
      .in("organization_id", organizationIds)
      .order("completed_at", { ascending: false })
  ])

  if (customersResult.error) {
    throw new Error("failed_to_read_billing_customers")
  }
  if (consentResult.error) {
    throw new Error("failed_to_read_trial_card_consent")
  }

  const customerByOrganization = new Map(
    ((customersResult.data ?? []) as CustomerRow[]).map((row) => [row.organization_id, row])
  )
  // 조직마다 가장 최근 동의만 본다(내림차순으로 읽었다).
  const consentByOrganization = new Map<string, string | null>()
  for (const row of (consentResult.data ?? []) as ConsentRow[]) {
    if (!consentByOrganization.has(row.organization_id)) {
      consentByOrganization.set(row.organization_id, row.completed_at)
    }
  }

  return rows.map((row) => {
    const customer = customerByOrganization.get(row.organization_id) ?? null
    return {
      organizationId: row.organization_id,
      planCode: "standard" as const,
      subscriptionStatus: row.subscription_status,
      trialOrigin: row.trial_origin,
      trialEndsAt: row.trial_ends_at,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      consentedAt: consentByOrganization.get(row.organization_id) ?? null,
      hasActiveBillingKey: Boolean(customer),
      billingKey: customer?.billing_key ?? null,
      customerKey: customer?.provider_customer_key ?? null
    }
  })
}
