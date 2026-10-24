"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { toMarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"
import { parseMarketingConsentInput, type MarketingConsentItem } from "@/features/marketing-consent/lib/marketing-consent"
import { sendMarketingConsentNoticeSafely } from "@/features/marketing-consent/server/consent-notice-sender"
import { listAcademyMarketingConsents, setAcademyMarketingConsent } from "@/features/marketing-consent/server/marketing-consent-db"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import type { ActionResult } from "@/shared/actions"

const MESSAGES: Record<string, string> = {
  invalid_consent_input: "요청을 확인하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  invalid_consent_source: "요청을 확인하지 못했어요. 화면을 새로 고친 뒤 다시 시도해 주세요.",
  parent_required: "학부모 계정으로 로그인해 주세요.",
  organization_not_found: "학원을 찾지 못했어요.",
  temporarily_unavailable: "잠시 후 다시 시도해 주세요."
}

/**
 * 학부모 웹의 학원 안내 문자 수신 동의 · 철회(2차-3). 앱 API 와 같은 계약 · 같은 RPC · 같은 처리 결과 알림이다(source = parent_web).
 * 화면(신청 완료 직전 선택 체크 · 내 정보 › 알림 설정)은 이 액션을 부른다.
 */
export async function setAcademyMarketingConsentAction(input: {
  organizationId: string
  consented: boolean
  textVersion: string
}): Promise<ActionResult<MarketingConsentItem>> {
  const parsed = parseMarketingConsentInput({ ...input, source: "parent_web" }, "parent_web")
  if (!parsed.ok) return { ok: false, message: MESSAGES[parsed.error] }
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, message: MESSAGES.parent_required }
    const result = await setAcademyMarketingConsent(supabase, parsed.value, user.id)
    if (!result.ok) return { ok: false, message: MESSAGES[result.error] }
    // 상태가 실제로 바뀐 경우만 처리 결과 알림(앱 API 와 같다). 응답을 보낸 뒤 보내고, 실패해도 저장은 성공이다.
    if (result.changed === true) {
      const change = toMarketingConsentChange(user.id, result.item)
      after(() => sendMarketingConsentNoticeSafely(change).then(() => undefined))
    }
    revalidatePath("/my")
    return { ok: true, data: result.item }
  } catch {
    return { ok: false, message: MESSAGES.temporarily_unavailable }
  }
}

/** 내 정보 › 알림 설정의 학원별 목록. */
export async function listMyAcademyMarketingConsentsAction(): Promise<ActionResult<MarketingConsentItem[]>> {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, message: MESSAGES.parent_required }
    const result = await listAcademyMarketingConsents(supabase)
    return result.ok ? { ok: true, data: result.items } : { ok: false, message: MESSAGES[result.error] }
  } catch {
    return { ok: false, message: MESSAGES.temporarily_unavailable }
  }
}
