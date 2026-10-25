"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { toMarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"
import { parseMarketingConsentInput, type MarketingConsentState } from "@/features/marketing-consent/lib/marketing-consent"
import { sendMarketingConsentNoticeSafely } from "@/features/marketing-consent/server/consent-notice-sender"
import { getAcademyNewsConsent, setAcademyNewsConsent } from "@/features/marketing-consent/server/marketing-consent-db"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type { ActionResult } from "@/shared/actions"

const MESSAGES: Record<string, string> = {
  invalid_consent_input: "요청을 확인하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  invalid_consent_source: "요청을 확인하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  parent_required: "학부모 계정으로 로그인해 주세요.",
  temporarily_unavailable: "잠시 후 다시 시도해 주세요."
}

/**
 * 학부모 웹의 학원 소식 수신 동의 · 철회(첫수업 하나). 앱 API 와 같은 계약 · 같은 RPC · 같은 처리 결과 알림이다(source = parent_web).
 */
export async function setAcademyNewsConsentAction(input: {
  consented: boolean
  textVersion: string
}): Promise<ActionResult<MarketingConsentState>> {
  const parsed = parseMarketingConsentInput({ ...input, source: "parent_web" }, "parent_web")
  if (!parsed.ok) return { ok: false, message: MESSAGES[parsed.error] }
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, message: MESSAGES.parent_required }
    const result = await setAcademyNewsConsent(supabase, parsed.value)
    if (!result.ok) return { ok: false, message: MESSAGES[result.error] }
    // 상태가 실제로 바뀐 경우만 처리 결과 알림(앱 API 와 같다). 응답을 보낸 뒤 보내고, 실패해도 저장은 성공이다.
    if (result.changed === true) {
      const change = toMarketingConsentChange(user.id, "parent_web", result.state)
      after(() => sendMarketingConsentNoticeSafely(change).then(() => undefined))
    }
    revalidatePath("/my")
    return { ok: true, data: result.state }
  } catch {
    return { ok: false, message: MESSAGES.temporarily_unavailable }
  }
}

/** 내 학원 소식 수신 동의 상태. */
export async function getMyAcademyNewsConsentAction(): Promise<ActionResult<MarketingConsentState>> {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, message: MESSAGES.parent_required }
    const result = await getAcademyNewsConsent(supabase, user.id)
    return result.ok ? { ok: true, data: result.state } : { ok: false, message: MESSAGES[result.error] }
  } catch {
    return { ok: false, message: MESSAGES.temporarily_unavailable }
  }
}
