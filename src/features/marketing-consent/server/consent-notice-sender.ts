import "server-only"

import { createHash } from "node:crypto"

import { maskAccountPhone, toAccountPhone } from "@/features/marketing-consent/lib/account-phone"
import { buildMarketingConsentNotice, type MarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"
import { sendSms } from "@/features/notifications/sms/sender"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getLocalMutationGuard } from "@/shared/config/server-env"

export type MarketingConsentNoticeInput = MarketingConsentChange

export type MarketingConsentNoticeResult = {
  status: "sent" | "dry_run" | "failed" | "skipped"
  /** skipped · failed 이유(번호 · 이름은 넣지 않는다). */
  reason: string | null
}

/** SQL app.recontact_phone_hash 와 같다(숫자만 sha256). */
export const hashRecontactPhone = (phone: string) => createHash("sha256").update(phone.replace(/\D/g, "")).digest("hex")

// organization_id 는 옛 학원별 동의 알림의 열이다. 동의가 첫수업 하나가 된 뒤(20261026120000) 새 알림은 늘 null 이다.
type NoticeRow = {
  parent_id: string
  organization_id: null
  action: "consent" | "withdraw"
  source: "parent_app" | "parent_web" | "opt_out_080"
  phone_hash: string | null
  occurred_at: string
}

const finishRow = (result: MarketingConsentNoticeResult, sent: { providerMessageId: string | null; sentAt: string | null } | null, masked: string | null) => ({
  status: result.status,
  recipient_phone_masked: masked,
  provider_message_id: sent?.providerMessageId ?? null,
  error_code: result.reason,
  sent_at: result.status === "sent" ? sent?.sentAt ?? new Date().toISOString() : null,
  updated_at: new Date().toISOString()
})

/** 학부모 계정 번호를 읽어 문자를 보낸다. 기록은 부르는 쪽이 한다. */
const deliver = async (input: { parentId: string; action: "consent" | "withdraw"; at: Date; phoneOverride?: string }) => {
  const db = getSupabaseServiceRoleClient()
  const [profile, user] = await Promise.all([
    db.from("profiles").select("role, phone").eq("id", input.parentId).maybeSingle(),
    db.auth.admin.getUserById(input.parentId)
  ])
  if (profile.error || user.error) {
    return { result: { status: "failed", reason: "recipient_unavailable" } as MarketingConsentNoticeResult, sent: null, masked: null }
  }
  const skip = (reason: string) => ({ result: { status: "skipped", reason } as MarketingConsentNoticeResult, sent: null, masked: null })
  if (!profile.data || profile.data.role !== "parent") return skip("not_parent")
  if (user.data.user?.app_metadata?.app_store_review === true) return skip("app_store_review")
  // 080 알림은 거부한 그 번호로 보낸다(그 번호가 계정 번호인 학부모를 찾은 뒤다).
  const phone = toAccountPhone(input.phoneOverride ?? profile.data.phone ?? null)
  if (!phone) return skip("parent_phone_missing")

  const message = buildMarketingConsentNotice({ action: input.action, at: input.at })
  const sent = await sendSms({ recipientType: "parent", phone, messagePreview: message, contentType: "COMM" })
  const result: MarketingConsentNoticeResult = sent.status === "sent" || sent.status === "dry_run"
    ? { status: sent.status, reason: null }
    : { status: sent.status, reason: sent.errorMessage ?? "send_failed" }
  return { result, sent, masked: maskAccountPhone(phone) }
}

/**
 * 학원 소식 수신 동의 · 철회 처리 결과 알림(서비스 문자, COMM). 학부모 앱 · 웹 공용.
 *
 * 받는 번호는 학부모 계정 번호다(학원 소식 문자와 같다). 결과는 marketing_consent_notices 에 남긴다.
 * 로컬 가드(개발 환경 + 운영 DB)면 보내지도 기록하지도 않는다. SMS_SEND_ENABLED 가 꺼져 있으면 dry_run 으로 남는다.
 * 앱 심사용 학부모 계정에는 보내지 않는다(skipped 로 남긴다).
 */
export const sendMarketingConsentNotice = async (input: MarketingConsentNoticeInput): Promise<MarketingConsentNoticeResult> => {
  if (!getLocalMutationGuard().allowed) return { status: "skipped", reason: "local_guard" }
  const row: NoticeRow = {
    parent_id: input.parentId,
    organization_id: null,
    action: input.action,
    source: input.source,
    phone_hash: null,
    occurred_at: input.at.toISOString()
  }
  const { result, sent, masked } = await deliver(input)
  const { error } = await getSupabaseServiceRoleClient().from("marketing_consent_notices").insert({ ...row, ...finishRow(result, sent, masked) })
  if (error) console.error("[marketing consent notice log failed]", error.code ?? "unknown")
  return result
}

/**
 * 080 무료수신거부 처리 결과 알림. 번호마다 한 번: 보내기 전에 claimed 로 자리를 잡는다
 * (sent · skipped 는 자리를 지키고, failed · dry_run 은 비워 다음 동기화에서 다시 시도한다).
 */
export const sendOptOutNotice = async (input: { parentId: string; phone: string; at: Date }): Promise<MarketingConsentNoticeResult & { claimed: boolean }> => {
  if (!getLocalMutationGuard().allowed) return { status: "skipped", reason: "local_guard", claimed: false }
  const phone = toAccountPhone(input.phone)
  if (!phone) return { status: "skipped", reason: "parent_phone_missing", claimed: false }
  const db = getSupabaseServiceRoleClient()
  const { data: claim, error: claimError } = await db
    .from("marketing_consent_notices")
    .insert({
      parent_id: input.parentId,
      organization_id: null,
      action: "withdraw",
      source: "opt_out_080",
      phone_hash: hashRecontactPhone(phone),
      occurred_at: input.at.toISOString(),
      status: "claimed"
    })
    .select("id")
    .maybeSingle()
  // 23505 = 이미 보냈거나(sent · skipped) 다른 실행이 잡았다.
  if (claimError?.code === "23505") return { status: "skipped", reason: "already_notified", claimed: false }
  if (claimError || !claim) return { status: "failed", reason: "claim_failed", claimed: false }

  let outcome: Awaited<ReturnType<typeof deliver>>
  try {
    outcome = await deliver({ parentId: input.parentId, action: "withdraw", at: input.at, phoneOverride: phone })
  } catch {
    outcome = { result: { status: "failed", reason: "notice_exception" }, sent: null, masked: null }
  }
  await db.from("marketing_consent_notices").update(finishRow(outcome.result, outcome.sent, outcome.masked)).eq("id", (claim as { id: string }).id)
  return { ...outcome.result, claimed: true }
}

/** 실패해도 동의 · 철회 저장은 이미 성공했다. 예외를 밖으로 내보내지 않는다. */
export const sendMarketingConsentNoticeSafely = async (input: MarketingConsentNoticeInput): Promise<MarketingConsentNoticeResult> => {
  try {
    return await sendMarketingConsentNotice(input)
  } catch (error) {
    console.error("[marketing consent notice failed]", error instanceof Error ? error.message : "unknown")
    return { status: "failed", reason: "notice_exception" }
  }
}
