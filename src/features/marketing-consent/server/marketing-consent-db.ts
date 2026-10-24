import type { SupabaseClient } from "@supabase/supabase-js"

import { isMarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"
import {
  toMarketingConsentError,
  type MarketingConsentErrorCode,
  type MarketingConsentInput,
  type MarketingConsentItem
} from "@/features/marketing-consent/lib/marketing-consent"

// 서버에서만 부른다(native-handler · 웹 action). 학부모 세션의 client 로만 부른다(웹: 쿠키 세션, 앱: Bearer 토큰). service role 을 쓰지 않는다 —
// RPC 가 auth.uid() 로 본인만 바꾸게 막는다.

/**
 * 학부모 본인의 지금 동의 값(RLS: 본인 행만). null = 행 없음, undefined = 읽지 못함.
 * 처리 결과 알림을 "상태가 실제로 바뀐 경우"에만 보내려고 RPC 바로 앞에서 읽는다.
 */
const readMyAcademyMarketingConsent = async (db: SupabaseClient, parentId: string, organizationId: string) => {
  try {
    const { data, error } = await db
      .from("parent_marketing_consents")
      .select("consented")
      .eq("parent_id", parentId)
      .eq("organization_id", organizationId)
      .maybeSingle()
    if (error) return undefined
    return data ? Boolean((data as { consented: boolean }).consented) : null
  } catch {
    return undefined
  }
}

export const setAcademyMarketingConsent = async (
  db: SupabaseClient,
  input: MarketingConsentInput,
  parentId: string
): Promise<
  | { ok: true; item: MarketingConsentItem; changed: boolean | null }
  | { ok: false; error: MarketingConsentErrorCode }
> => {
  const previous = await readMyAcademyMarketingConsent(db, parentId, input.organizationId)
  const { data, error } = await db.rpc("set_my_academy_marketing_consent", {
    p_organization_id: input.organizationId,
    p_consented: input.consented,
    p_source: input.source,
    p_text_version: input.textVersion
  })
  if (error || !data || typeof data !== "object") return { ok: false, error: toMarketingConsentError(error?.message) }
  const row = data as { organizationId: string; consented: boolean; consentedAt: string | null; withdrawnAt: string | null }
  return {
    ok: true,
    item: { organizationId: row.organizationId, consented: row.consented, consentedAt: row.consentedAt, withdrawnAt: row.withdrawnAt },
    // null = 이전 값을 읽지 못함(알림을 보내지 않는다).
    changed: previous === undefined ? null : isMarketingConsentChange(previous, row.consented)
  }
}

export const listAcademyMarketingConsents = async (
  db: SupabaseClient
): Promise<{ ok: true; items: MarketingConsentItem[] } | { ok: false; error: MarketingConsentErrorCode }> => {
  const { data, error } = await db.rpc("list_my_academy_marketing_consents")
  if (error || !Array.isArray(data)) return { ok: false, error: toMarketingConsentError(error?.message) }
  return {
    ok: true,
    items: (data as Array<{ organization_id: string; organization_name: string; consented: boolean; consented_at: string | null; withdrawn_at: string | null }>)
      .map((row) => ({
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        consented: row.consented,
        consentedAt: row.consented_at,
        withdrawnAt: row.withdrawn_at
      }))
  }
}
