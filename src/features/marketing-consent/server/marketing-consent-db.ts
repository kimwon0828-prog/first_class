import type { SupabaseClient } from "@supabase/supabase-js"

import {
  EMPTY_MARKETING_CONSENT,
  toMarketingConsentError,
  type MarketingConsentErrorCode,
  type MarketingConsentInput,
  type MarketingConsentState
} from "@/features/marketing-consent/lib/marketing-consent"

// 서버에서만 부른다(native-handler · 웹 action). 학부모 세션의 client 로만 부른다(웹: 쿠키 세션, 앱: Bearer 토큰). service role 을 쓰지 않는다 —
// RPC 가 auth.uid() 로 본인만 바꾸게 막고, 읽기는 RLS 가 본인 행만 보여 준다.

/**
 * changed: RPC 가 학부모 잠금 안에서 판정한 "상태가 실제로 바뀌었는가"(없음→동의 · 동의→거부 · 거부→동의).
 * 처리 결과 알림은 이 값이 true 일 때만 보낸다. 값이 없으면 null — 보내지 않는다.
 */
export const setAcademyNewsConsent = async (
  db: SupabaseClient,
  input: MarketingConsentInput
): Promise<
  | { ok: true; state: MarketingConsentState; changed: boolean | null }
  | { ok: false; error: MarketingConsentErrorCode }
> => {
  const { data, error } = await db.rpc("set_my_academy_news_consent", {
    p_consented: input.consented,
    p_source: input.source,
    p_text_version: input.textVersion
  })
  if (error || !data || typeof data !== "object") return { ok: false, error: toMarketingConsentError(error?.message) }
  const row = data as { consented: boolean; consentedAt: string | null; withdrawnAt: string | null; changed?: unknown }
  return {
    ok: true,
    state: { consented: row.consented, consentedAt: row.consentedAt, withdrawnAt: row.withdrawnAt },
    changed: typeof row.changed === "boolean" ? row.changed : null
  }
}

/** 내 동의 상태. 기록이 없으면 동의 안 함(두 시각 null). */
export const getAcademyNewsConsent = async (
  db: SupabaseClient,
  parentId: string
): Promise<{ ok: true; state: MarketingConsentState } | { ok: false; error: MarketingConsentErrorCode }> => {
  const { data, error } = await db
    .from("parent_academy_news_consents")
    .select("consented, consented_at, withdrawn_at")
    .eq("parent_id", parentId)
    .maybeSingle()
  if (error) return { ok: false, error: "temporarily_unavailable" }
  if (!data) return { ok: true, state: { ...EMPTY_MARKETING_CONSENT } }
  const row = data as { consented: boolean; consented_at: string | null; withdrawn_at: string | null }
  return { ok: true, state: { consented: row.consented, consentedAt: row.consented_at, withdrawnAt: row.withdrawn_at } }
}
