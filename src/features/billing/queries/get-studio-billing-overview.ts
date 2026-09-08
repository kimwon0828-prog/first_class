import "server-only"

import { cache } from "react"

import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import {
  resolveBillingPresentation,
  resolveCardIssuerName,
  USER_VISIBLE_PAYMENT_STATUSES,
  type BillingMethodDisplay,
  type BillingPresentation
} from "@/features/billing/lib/subscription-presentation"
import { getTossRuntime } from "@/features/billing/lib/toss/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { dataAdapter } from "@/shared/lib/db"

// 결제 화면이 쓰는 데이터를 서버에서 한 번에 만든다.
//
// 화면은 raw billing 테이블을 조합하지 않는다. 여기서 나온 presentation 만 받는다.
// billingKey · provider customer key 는 이 모델에 들어가지 않는다 —
// client payload 로 나갈 수 있는 값에는 결제 credential 을 담지 않는다.

const PAYMENT_HISTORY_LIMIT = 10

export type BillingPaymentHistoryItem = {
  id: string
  /** 결제가 확정된 시각. 실패 건은 실패 시각을 쓴다. */
  occurredAt: string | null
  planCode: string
  amount: number
  status: string
}

export type StudioBillingOverview = {
  presentation: BillingPresentation
  /** 결제를 시작할 수 있는 배포인가. 이유는 담지 않는다. */
  billingAvailable: boolean
  standardAmount: number
  billingMethod: BillingMethodDisplay | null
  payments: BillingPaymentHistoryItem[]
}

type BillingCustomerRow = {
  card_company: string | null
  card_number_masked: string | null
  billing_key_status: string
}

type PaymentRow = {
  id: string
  plan_code: string
  amount: number
  status: string
  paid_at: string | null
  failed_at: string | null
  canceled_at: string | null
  created_at: string
}

const readBillingMethod = async (
  organizationId: string
): Promise<{ display: BillingMethodDisplay | null; active: boolean }> => {
  const client = getSupabaseServiceRoleClient()
  // 표시해도 되는 필드만 읽는다. billing_key 는 select 하지 않는다.
  const { data, error } = await client
    .from("organization_billing_customers")
    .select("card_company, card_number_masked, billing_key_status")
    .eq("organization_id", organizationId)
    .eq("provider", "toss")
    .maybeSingle()

  if (error || !data) {
    return { display: null, active: false }
  }

  const row = data as BillingCustomerRow
  if (row.billing_key_status !== "active") {
    return { display: null, active: false }
  }

  return {
    display: {
      issuerName: resolveCardIssuerName(row.card_company),
      maskedNumber: row.card_number_masked
    },
    active: true
  }
}

const readPaymentHistory = async (
  organizationId: string
): Promise<BillingPaymentHistoryItem[]> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("organization_payments")
    .select("id, plan_code, amount, status, paid_at, failed_at, canceled_at, created_at")
    .eq("organization_id", organizationId)
    // 기술적 시도(pending)는 원장에게 결제 결과가 아니다.
    .in("status", USER_VISIBLE_PAYMENT_STATUSES)
    .order("created_at", { ascending: false })
    .limit(PAYMENT_HISTORY_LIMIT)

  if (error || !data) {
    return []
  }

  return (data as PaymentRow[]).map((row) => ({
    id: row.id,
    occurredAt: row.paid_at ?? row.failed_at ?? row.canceled_at ?? row.created_at,
    planCode: row.plan_code,
    amount: row.amount,
    status: row.status
  }))
}

const getStudioBillingOverviewCached = cache(
  async (organizationId: string): Promise<StudioBillingOverview> => {
    const [resolved, snapshot, billingMethod, payments] = await Promise.all([
      getStudioEntitlementsForDisplay(organizationId),
      dataAdapter.getOrganizationBillingSnapshot(organizationId).catch(() => ({
        subscription: null,
        override: null
      })),
      readBillingMethod(organizationId),
      readPaymentHistory(organizationId)
    ])

    const standardAmount = getPurchasableBillingPlan("standard")?.amount ?? 0

    return {
      presentation: resolveBillingPresentation({
        resolved,
        subscription: snapshot.subscription,
        hasActiveBillingMethod: billingMethod.active,
        standardAmount
      }),
      billingAvailable: getTossRuntime().status === "ready",
      standardAmount,
      billingMethod: billingMethod.display,
      payments
    }
  }
)

export const getStudioBillingOverview = async (
  organizationId: string
): Promise<StudioBillingOverview> => getStudioBillingOverviewCached(organizationId)
