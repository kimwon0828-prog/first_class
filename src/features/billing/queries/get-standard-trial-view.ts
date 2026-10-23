import "server-only"

import { cache } from "react"

import { buildStandardTrialView, isAutoTrialSubscription, type StandardTrialView } from "@/features/billing/lib/standard-trial"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { dataAdapter } from "@/shared/lib/db"
import type { OrganizationBillingSnapshot } from "@/shared/lib/db/adapter"

// 자동 체험(승인 90일) 화면 모델에 필요한 읽기. 쓰기는 하지 않는다.
//
//   구독 snapshot           기존 adapter 조회(요청 단위 cache) — 사이드바 플랜 카드와 같은 값
//   활성 카드 여부           organization_billing_customers.billing_key_status (billing_key 는 읽지 않는다)
//   자동 결제 동의 시각       가장 최근에 완료된 register_card 세션의 completed_at
//
// 카드 · 동의는 service role 로만 읽힌다(authenticated 에 grant 없음). 조직은 호출자가
// requireTeacherStudioAccess 로 확인한 값만 넘긴다.

export const getStudioBillingSnapshot = cache(
  async (organizationId: string): Promise<OrganizationBillingSnapshot> => dataAdapter.getOrganizationBillingSnapshot(organizationId)
)

export type TrialCardFacts = {
  hasActiveBillingMethod: boolean
  consentedAt: string | null
}

export const readTrialCardFacts = cache(async (organizationId: string): Promise<TrialCardFacts> => {
  const client = getSupabaseServiceRoleClient()
  const [customer, consent] = await Promise.all([
    client
      .from("organization_billing_customers")
      .select("billing_key_status")
      .eq("organization_id", organizationId)
      .eq("provider", "toss")
      .maybeSingle(),
    client
      .from("billing_checkout_sessions")
      .select("completed_at")
      .eq("organization_id", organizationId)
      .eq("status", "completed")
      .eq("purpose", "register_card")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ])

  return {
    hasActiveBillingMethod: !customer.error && (customer.data as { billing_key_status?: string } | null)?.billing_key_status === "active",
    consentedAt: consent.error ? null : ((consent.data as { completed_at?: string | null } | null)?.completed_at ?? null)
  }
})

/**
 * 자동 체험 화면 모델. 자동 체험이 아니거나 끝났으면 null 이다.
 * 카드 · 동의는 자동 체험일 때만 읽는다 — 다른 학원의 화면에는 조회가 늘지 않는다.
 */
export const getStandardTrialView = async (
  organizationId: string,
  snapshot: OrganizationBillingSnapshot,
  now: Date = new Date()
): Promise<StandardTrialView | null> => {
  if (!isAutoTrialSubscription(snapshot.subscription)) {
    return null
  }

  const facts = await readTrialCardFacts(organizationId)
  return buildStandardTrialView(snapshot.subscription, { now, ...facts })
}
