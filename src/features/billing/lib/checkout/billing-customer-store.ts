import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

// 결제수단(빌링키) 저장.
//
// billing_key 는 결제 credential 이다. authenticated 에 grant 가 없고 RLS 정책도 없다.
// 여기(service role)를 통하지 않으면 읽을 수 없다.
//
// 저장하는 카드 정보는 표시용뿐이다. 원번호·CVC·유효기간은 애초에 우리 서버로 오지 않는다
// (결제창이 카드 인증을 담당한다).

export type StoredBillingCustomer = {
  organizationId: string
  customerKey: string
  billingKey: string
  status: string
}

export const upsertBillingCustomer = async (input: {
  organizationId: string
  customerKey: string
  billingKey: string
  cardCompany: string | null
  cardNumberMasked: string | null
}) => {
  const client = getSupabaseServiceRoleClient()
  const { error } = await client.from("organization_billing_customers").upsert(
    {
      organization_id: input.organizationId,
      provider: "toss",
      provider_customer_key: input.customerKey,
      billing_key: input.billingKey,
      billing_key_status: "active",
      card_company: input.cardCompany,
      card_number_masked: input.cardNumberMasked
    },
    { onConflict: "organization_id" }
  )

  if (error) {
    throw new Error("failed_to_store_billing_customer")
  }
}

export const findActiveBillingCustomer = async (
  organizationId: string
): Promise<StoredBillingCustomer | null> => {
  const client = getSupabaseServiceRoleClient()
  const { data, error } = await client
    .from("organization_billing_customers")
    .select("organization_id, provider_customer_key, billing_key, billing_key_status")
    .eq("organization_id", organizationId)
    .eq("provider", "toss")
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const row = data as {
    organization_id: string
    provider_customer_key: string
    billing_key: string
    billing_key_status: string
  }

  if (row.billing_key_status !== "active") {
    return null
  }

  return {
    organizationId: row.organization_id,
    customerKey: row.provider_customer_key,
    billingKey: row.billing_key,
    status: row.billing_key_status
  }
}

export const markBillingKeyInvalid = async (organizationId: string) => {
  const client = getSupabaseServiceRoleClient()
  await client
    .from("organization_billing_customers")
    .update({ billing_key_status: "invalid" })
    .eq("organization_id", organizationId)
    .eq("provider", "toss")
}
