import "server-only"

import { buildMarketingConsentNotice, type MarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"
import { maskPhoneNumber, normalizePhoneNumber } from "@/features/notifications/sms/phone"
import { sendSms } from "@/features/notifications/sms/sender"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getLocalMutationGuard } from "@/shared/config/server-env"

export type MarketingConsentNoticeInput = MarketingConsentChange

export type MarketingConsentNoticeResult = {
  status: "sent" | "dry_run" | "failed" | "skipped"
  /** skipped · failed 이유(번호 · 이름은 넣지 않는다). */
  reason: string | null
}

/**
 * 수신 동의 · 철회 처리 결과 알림(서비스 문자, COMM). 학부모 앱 · 웹 공용.
 *
 * 받는 번호는 학부모 계정 번호(profiles.phone)다. 신청서 번호가 아니다.
 * 로컬 가드(개발 환경 + 운영 DB)면 보내지 않는다. SMS_SEND_ENABLED 가 꺼져 있으면 sendSms 가 dry_run 으로 돌려준다.
 * 앱 심사용 학부모 계정에는 보내지 않는다.
 */
export const sendMarketingConsentNotice = async (input: MarketingConsentNoticeInput): Promise<MarketingConsentNoticeResult> => {
  if (!getLocalMutationGuard().allowed) return { status: "skipped", reason: "local_guard" }

  const db = getSupabaseServiceRoleClient()
  const [profile, organization, user] = await Promise.all([
    db.from("profiles").select("role, phone").eq("id", input.parentId).maybeSingle(),
    db.from("organizations").select("name").eq("id", input.organizationId).maybeSingle(),
    db.auth.admin.getUserById(input.parentId)
  ])
  if (profile.error || organization.error || user.error) return { status: "failed", reason: "recipient_unavailable" }
  if (!profile.data || profile.data.role !== "parent") return { status: "skipped", reason: "not_parent" }
  if (user.data.user?.app_metadata?.app_store_review === true) return { status: "skipped", reason: "app_store_review" }
  const academyName = organization.data?.name?.trim()
  if (!academyName) return { status: "skipped", reason: "organization_missing" }
  const phone = normalizePhoneNumber(profile.data.phone ?? null)
  if (!phone) return { status: "skipped", reason: "parent_phone_missing" }

  const message = buildMarketingConsentNotice({ action: input.action, academyName, at: input.at })
  const sent = await sendSms({ recipientType: "parent", phone, messagePreview: message, contentType: "COMM" })
  // 발송 기록 표(초안 보고 중)가 생기기 전까지는 서버 로그에만 남긴다. 원번호 · 이름은 남기지 않는다.
  console.info("[marketing consent notice]", {
    action: input.action,
    organizationId: input.organizationId,
    status: sent.status,
    provider: sent.provider,
    providerMessageId: sent.providerMessageId,
    recipientPhoneMasked: maskPhoneNumber(phone),
    errorMessage: sent.errorMessage
  })
  if (sent.status === "sent" || sent.status === "dry_run") return { status: sent.status, reason: null }
  return { status: sent.status, reason: sent.errorMessage ?? "send_failed" }
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
