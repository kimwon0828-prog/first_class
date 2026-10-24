import "server-only"

import { getPurchasableBillingPlan } from "@/features/billing/lib/plan-catalog"
import {
  TRIAL_RESULT_NOTICE_WINDOW_DAYS,
  buildTrialNoticeMessage,
  resolveDueTrialNotice,
  resolveTrialNoticeRecipient,
  type TrialNoticeKind
} from "@/features/billing/lib/trial-notices"
import { sendSms } from "@/features/notifications/sms/sender"
import { maskPhoneNumber, normalizePhoneNumber } from "@/features/notifications/sms/phone"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getLocalMutationGuard } from "@/shared/config/server-env"
import { toStudioUrl } from "@/shared/config/site-origins"

// 스탠다드 무료 체험 알림 문자(크론, vercel.json 30 3 * * * = KST 12:30).
//
// 갱신 크론(KST 12:00) 뒤에 돈다 — 마지막 체험일의 첫 결제 결과를 다음 날 이 작업이 알린다.
//
// 지키는 것
//   1. 로컬 개발 서버가 운영 DB 를 보면 아무것도 하지 않는다(getLocalMutationGuard).
//   2. 보내기 전에 organization_billing_notices 에 claimed 로 자리를 잡는다. unique 충돌이면 이미
//      보냈거나 보내는 중이다 — 크론이 겹쳐도 한 번만 나간다.
//   3. 문자 꺼짐(SMS_SEND_ENABLED)은 dry_run 으로 남고 자리를 차지하지 않는다 — 운영에서 켜면 그때 나간다.
//   4. 받을 번호가 없으면 skipped 로 남긴다(그 알림의 최종 결정).
//   5. 발송 실패는 사용자의 다른 작업을 막지 않는다. 이 작업 안에서만 기록한다.

const DAY_MS = 24 * 60 * 60 * 1000
/** 30일 전 알림 창(마지막 체험일 29일 전)까지 볼 수 있게 31일 앞까지 읽는다. */
const LOOKAHEAD_DAYS = 31
const CANDIDATE_LIMIT = 500
const STALE_CLAIM_MS = 60 * 60 * 1000

export type TrialNoticeRunSummary = {
  blocked?: string
  scanned: number
  due: number
  sent: number
  dryRun: number
  skipped: number
  failed: number
  alreadyClaimed: number
  byKind: Partial<Record<TrialNoticeKind, number>>
}

type SubscriptionRow = {
  organization_id: string
  subscription_status: string
  current_period_start: string | null
  current_period_end: string | null
  grace_period_end: string | null
  cancel_at_period_end: boolean
  trial_ends_at: string
}

const emptySummary = (): TrialNoticeRunSummary => ({
  scanned: 0,
  due: 0,
  sent: 0,
  dryRun: 0,
  skipped: 0,
  failed: 0,
  alreadyClaimed: 0,
  byKind: {}
})

export const runTrialNotices = async (now: Date = new Date()): Promise<TrialNoticeRunSummary> => {
  const guard = getLocalMutationGuard()
  if (!guard.allowed) {
    return { ...emptySummary(), blocked: guard.code }
  }

  const client = getSupabaseServiceRoleClient()
  const summary = emptySummary()
  const amount = getPurchasableBillingPlan("standard")?.amount ?? 0
  const billingUrl = toStudioUrl("/billing")

  // 작업 중 멈춘 claimed 는 failed 로 내려 다시 잡을 수 있게 한다.
  await client
    .from("organization_billing_notices")
    .update({ status: "failed", error_message: "stale_claim" })
    .eq("status", "claimed")
    .lt("claimed_at", new Date(now.getTime() - STALE_CLAIM_MS).toISOString())

  const { data: subscriptionData, error } = await client
    .from("organization_subscriptions")
    .select("organization_id, subscription_status, current_period_start, current_period_end, grace_period_end, cancel_at_period_end, trial_ends_at")
    .eq("trial_origin", "signup_approval")
    .gt("trial_ends_at", new Date(now.getTime() - TRIAL_RESULT_NOTICE_WINDOW_DAYS * DAY_MS).toISOString())
    .lte("trial_ends_at", new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS).toISOString())
    .order("trial_ends_at", { ascending: true })
    .limit(CANDIDATE_LIMIT)

  if (error) {
    throw new Error("failed_to_read_trial_notice_candidates")
  }

  const rows = (subscriptionData ?? []) as SubscriptionRow[]
  summary.scanned = rows.length
  if (rows.length === 0) {
    return summary
  }

  const organizationIds = rows.map((row) => row.organization_id)
  const [customers, consents, pendingPayments, organizations, signups] = await Promise.all([
    client
      .from("organization_billing_customers")
      .select("organization_id")
      .eq("provider", "toss")
      .eq("billing_key_status", "active")
      .in("organization_id", organizationIds),
    client
      .from("billing_checkout_sessions")
      .select("organization_id, completed_at")
      .eq("status", "completed")
      .eq("purpose", "register_card")
      .in("organization_id", organizationIds)
      .order("completed_at", { ascending: false }),
    client
      .from("organization_payments")
      .select("organization_id, period_start")
      .eq("status", "pending")
      .eq("attempt_kind", "renewal")
      .in("organization_id", organizationIds),
    client.from("organizations").select("id, contact_phone, academy_phone").in("id", organizationIds),
    client
      .from("teacher_signup_requests")
      .select("approved_organization_id, contact_phone, reviewed_at")
      .eq("status", "approved")
      .in("approved_organization_id", organizationIds)
      .order("reviewed_at", { ascending: false })
  ])

  for (const result of [customers, consents, pendingPayments, organizations, signups]) {
    if (result.error) {
      throw new Error("failed_to_read_trial_notice_context")
    }
  }

  const activeCard = new Set(((customers.data ?? []) as Array<{ organization_id: string }>).map((row) => row.organization_id))
  const consentByOrg = new Map<string, string | null>()
  for (const row of (consents.data ?? []) as Array<{ organization_id: string; completed_at: string | null }>) {
    if (!consentByOrg.has(row.organization_id)) consentByOrg.set(row.organization_id, row.completed_at)
  }
  const pendingByOrg = new Map<string, Set<number>>()
  for (const row of (pendingPayments.data ?? []) as Array<{ organization_id: string; period_start: string | null }>) {
    if (!row.period_start) continue
    const set = pendingByOrg.get(row.organization_id) ?? new Set<number>()
    set.add(new Date(row.period_start).getTime())
    pendingByOrg.set(row.organization_id, set)
  }
  const orgById = new Map(
    ((organizations.data ?? []) as Array<{ id: string; contact_phone: string | null; academy_phone: string | null }>).map((row) => [row.id, row])
  )
  const signupContactByOrg = new Map<string, string | null>()
  for (const row of (signups.data ?? []) as Array<{ approved_organization_id: string; contact_phone: string | null }>) {
    if (!signupContactByOrg.has(row.approved_organization_id)) signupContactByOrg.set(row.approved_organization_id, row.contact_phone)
  }

  for (const row of rows) {
    const notice = resolveDueTrialNotice(
      {
        status: row.subscription_status,
        trialEndsAt: row.trial_ends_at,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        gracePeriodEnd: row.grace_period_end,
        hasActiveBillingMethod: activeCard.has(row.organization_id),
        consentedAt: consentByOrg.get(row.organization_id) ?? null,
        firstChargePending: pendingByOrg.get(row.organization_id)?.has(new Date(row.trial_ends_at).getTime()) ?? false
      },
      now
    )
    if (!notice) continue
    summary.due += 1

    // 1) 자리 잡기. unique(조직, 종류, 종료 시각) where status in (claimed, sent, skipped)
    const { data: claimed, error: claimError } = await client
      .from("organization_billing_notices")
      .insert({ organization_id: row.organization_id, notice_kind: notice.kind, period_end: notice.periodEnd, status: "claimed" })
      .select("id")
      .maybeSingle()

    if (claimError) {
      if (claimError.code === "23505") {
        summary.alreadyClaimed += 1
        continue
      }
      summary.failed += 1
      continue
    }
    const noticeId = (claimed as { id: string } | null)?.id
    if (!noticeId) {
      summary.failed += 1
      continue
    }

    const message = buildTrialNoticeMessage({
      notice,
      amount,
      nextChargeAt: row.current_period_end,
      gracePeriodEnd: row.grace_period_end,
      billingUrl
    })

    // 2) 받는 번호: 학원 담당자 → 학원 대표 → 승인된 가입 신청의 담당자. 없으면 skipped.
    const organization = orgById.get(row.organization_id)
    const recipient = resolveTrialNoticeRecipient({
      organizationContactPhone: organization?.contact_phone ?? null,
      organizationAcademyPhone: organization?.academy_phone ?? null,
      signupContactPhone: signupContactByOrg.get(row.organization_id) ?? null
    })

    if (!recipient || !normalizePhoneNumber(recipient.phone)) {
      await client
        .from("organization_billing_notices")
        .update({ status: "skipped", error_message: "recipient_phone_missing", message_preview: message })
        .eq("id", noticeId)
      summary.skipped += 1
      summary.byKind[notice.kind] = (summary.byKind[notice.kind] ?? 0) + 1
      continue
    }

    // 3) 발송. SMS_SEND_ENABLED 가 꺼져 있으면 sender 가 dry_run 을 돌려준다.
    const result = await sendSms({ recipientType: "admin", phone: recipient.phone, messagePreview: message })
    const status = result.status === "sent" ? "sent" : result.status === "dry_run" ? "dry_run" : result.status === "skipped" ? "skipped" : "failed"
    await client
      .from("organization_billing_notices")
      .update({
        status,
        recipient_phone_masked: result.recipientPhoneMasked ?? maskPhoneNumber(normalizePhoneNumber(recipient.phone)),
        message_preview: message,
        provider_message_id: result.providerMessageId,
        error_message: result.errorMessage,
        sent_at: result.sentAt
      })
      .eq("id", noticeId)

    if (status === "sent") summary.sent += 1
    else if (status === "dry_run") summary.dryRun += 1
    else if (status === "skipped") summary.skipped += 1
    else summary.failed += 1
    summary.byKind[notice.kind] = (summary.byKind[notice.kind] ?? 0) + 1
  }

  return summary
}
