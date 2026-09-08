import "server-only"

import type { RenewalSubject } from "@/features/billing/lib/renewal/renewal-schedule"
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

const CANDIDATE_LIMIT = 200

export type RenewalCandidate = RenewalSubject & {
  organizationId: string
  planCode: "standard" | "pro"
  billingKey: string
  customerKey: string
}

type SubscriptionRow = {
  organization_id: string
  plan_code: string
  subscription_status: string
  current_period_end: string | null
  grace_period_end: string | null
  cancel_at_period_end: boolean
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
      "organization_id, plan_code, subscription_status, current_period_end, grace_period_end, cancel_at_period_end"
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
        customerKey: customer.provider_customer_key
      }
    ]
  })
}
