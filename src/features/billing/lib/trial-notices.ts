// 스탠다드 무료 체험 알림 문자: 언제 무엇을 보낼지 + 문구.
//
// 순수 함수만 둔다(발송 · 기록은 run-trial-notices.ts). 날짜는 standard-trial.ts 기준이다.
//
//   종료 전(체험 중)
//     trial_ends_in_30_days  카드 등록 창이 열린 날(마지막 체험일 29일 전). 2일까지 따라잡는다.
//                            이미 카드를 등록했거나 해지 예약이면 보내지 않는다.
//     trial_ends_in_7_days   마지막 체험일 7일 전. 2일까지 따라잡는다.
//     trial_ends_in_1_day    마지막 체험일 전날("내일"). 따라잡지 않는다 — 당일 12:00 에 결제가 먼저 일어난다.
//     7 · 1일 전 문구는 상태마다 다르다: 카드 없음 / 카드 등록됨("N일에 39,000원이 결제돼요") / 해지 예약.
//
//   종료 뒤(종료 시각 이후 첫 알림 크론 ~ 종료 + 4일)
//     trial_first_charge_succeeded  active 이고 새 기간이 종료 시각부터 시작했다(유예 중 재시도 성공 포함)
//     trial_first_charge_failed     past_due 이고 기간 끝이 종료 시각이다(유예 중)
//     trial_ended_free              그 밖(카드 없음 · 해지 예약 · 결제가 일어나지 않음 · 유예 끝)
//     첫 결제 결과를 아직 모르면(pending) 아무것도 보내지 않고 다음 실행을 기다린다.

import {
  diffKstDays,
  formatKstDateLabel,
  isTrialConsentValid,
  resolveTrialLastDayKey,
  toKstDateKey
} from "@/features/billing/lib/standard-trial"

export const TRIAL_NOTICE_KINDS = [
  "trial_ends_in_30_days",
  "trial_ends_in_7_days",
  "trial_ends_in_1_day",
  "trial_ended_free",
  "trial_first_charge_succeeded",
  "trial_first_charge_failed"
] as const
export type TrialNoticeKind = (typeof TRIAL_NOTICE_KINDS)[number]

export type TrialNoticeSubject = {
  status: string
  trialEndsAt: string
  cancelAtPeriodEnd: boolean
  currentPeriodStart: string | null
  currentPeriodEnd: string | null
  gracePeriodEnd: string | null
  hasActiveBillingMethod: boolean
  consentedAt: string | null
  /** 첫 결제 시도가 결과를 모르는 채(pending)로 남아 있다. */
  firstChargePending: boolean
}

export type TrialNoticeVariant = "no_card" | "card_registered" | "cancel_scheduled"

export type DueTrialNotice = {
  kind: TrialNoticeKind
  variant: TrialNoticeVariant | null
  /** 알림 기록의 키. 체험 종료 시각이다(첫 결제 뒤 기간이 바뀌어도 같다). */
  periodEnd: string
}

const DAY_MS = 24 * 60 * 60 * 1000
/** 종료 뒤 결과 문자를 보낼 수 있는 기간. 유예(3일) 안의 재시도 성공까지 담는다. */
export const TRIAL_RESULT_NOTICE_WINDOW_DAYS = 4

const toTime = (value: string | null | undefined) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

export const resolveTrialNoticeVariant = (subject: TrialNoticeSubject): TrialNoticeVariant => {
  if (subject.cancelAtPeriodEnd) return "cancel_scheduled"
  return subject.hasActiveBillingMethod && isTrialConsentValid(new Date(subject.trialEndsAt), subject.consentedAt)
    ? "card_registered"
    : "no_card"
}

export const resolveDueTrialNotice = (subject: TrialNoticeSubject, now: Date): DueTrialNotice | null => {
  const endMs = toTime(subject.trialEndsAt)
  if (endMs == null) return null
  const trialEndsAt = new Date(endMs)
  const periodEnd = trialEndsAt.toISOString()
  const nowMs = now.getTime()

  // ── 종료 전 ─────────────────────────────────────────────
  if (nowMs < endMs) {
    if (subject.status !== "trialing") return null
    const variant = resolveTrialNoticeVariant(subject)
    const daysUntilLastDay = diffKstDays(toKstDateKey(now), resolveTrialLastDayKey(trialEndsAt))

    if (daysUntilLastDay === 1) {
      return { kind: "trial_ends_in_1_day", variant, periodEnd }
    }
    if (daysUntilLastDay >= 5 && daysUntilLastDay <= 7) {
      return { kind: "trial_ends_in_7_days", variant, periodEnd }
    }
    if (daysUntilLastDay >= 27 && daysUntilLastDay <= 29) {
      // 카드 등록 창이 열렸다는 안내다. 이미 등록했거나 해지 예약이면 할 말이 없다.
      return variant === "no_card" ? { kind: "trial_ends_in_30_days", variant, periodEnd } : null
    }
    return null
  }

  // ── 종료 뒤 ─────────────────────────────────────────────
  if (nowMs >= endMs + TRIAL_RESULT_NOTICE_WINDOW_DAYS * DAY_MS) return null

  const periodStartMs = toTime(subject.currentPeriodStart)
  const periodEndMs = toTime(subject.currentPeriodEnd)

  if (subject.status === "active" && periodStartMs != null && periodStartMs >= endMs) {
    return { kind: "trial_first_charge_succeeded", variant: null, periodEnd }
  }

  if (subject.status === "past_due" && periodEndMs === endMs) {
    const graceMs = toTime(subject.gracePeriodEnd)
    if (graceMs != null && graceMs > nowMs) {
      return { kind: "trial_first_charge_failed", variant: null, periodEnd }
    }
  }

  if (subject.firstChargePending) {
    return null
  }

  return { kind: "trial_ended_free", variant: null, periodEnd }
}

// ─────────────────────────────────────────────────────────────
// 문구 — "~해요"체. 날짜는 "M월 D일(요일)", 금액은 카탈로그 값.
// ─────────────────────────────────────────────────────────────

export type TrialNoticeMessageInput = {
  notice: DueTrialNotice
  amount: number
  /** 다음 결제일(첫 결제 성공) — 새 기간 끝의 KST 날짜 */
  nextChargeAt?: string | null
  /** 유예 끝(첫 결제 실패) */
  gracePeriodEnd?: string | null
  /** 문자 끝에 붙이는 플랜·결제 주소 */
  billingUrl: string
}

const won = (amount: number) => `${new Intl.NumberFormat("ko-KR").format(amount)}원`
const dateOf = (iso: string) => formatKstDateLabel(toKstDateKey(new Date(iso)))
/** 그 시각 직전의 날짜(유예 끝 00:00 KST → 전날) */
const dayBefore = (iso: string) => formatKstDateLabel(toKstDateKey(new Date(new Date(iso).getTime() - 1)))

export const buildTrialNoticeMessage = (input: TrialNoticeMessageInput): string => {
  const { notice, amount, billingUrl } = input
  const lastDay = formatKstDateLabel(resolveTrialLastDayKey(new Date(notice.periodEnd)))
  const price = won(amount)
  const tail = ` ${billingUrl}`

  switch (notice.kind) {
    case "trial_ends_in_30_days":
      return `[첫수업] 스탠다드 무료 체험이 ${lastDay}에 끝나요. 계속 쓰려면 오늘부터 플랜·결제에서 카드를 등록할 수 있어요. 등록하지 않으면 무료 플랜으로 바뀌어요.${tail}`
    case "trial_ends_in_7_days":
      if (notice.variant === "card_registered") {
        return `[첫수업] 스탠다드 무료 체험이 ${lastDay}에 끝나요. ${lastDay}에 ${price}이 결제돼요. 원하지 않으면 그 전에 플랜·결제에서 해지해 주세요.${tail}`
      }
      if (notice.variant === "cancel_scheduled") {
        return `[첫수업] 스탠다드 무료 체험이 ${lastDay}에 끝나요. 해지가 예약되어 있어 결제되지 않고, 무료 플랜으로 바뀌어요.${tail}`
      }
      return `[첫수업] 스탠다드 무료 체험이 ${lastDay}에 끝나요. 끝나면 무료 플랜으로 바뀌어요. 계속 쓰려면 플랜·결제에서 카드를 등록해 주세요.${tail}`
    case "trial_ends_in_1_day":
      if (notice.variant === "card_registered") {
        return `[첫수업] 스탠다드 무료 체험이 내일 ${lastDay}에 끝나요. 내일 ${price}이 결제돼요. 원하지 않으면 오늘 플랜·결제에서 해지해 주세요.${tail}`
      }
      if (notice.variant === "cancel_scheduled") {
        return `[첫수업] 스탠다드 무료 체험이 내일 ${lastDay}에 끝나요. 해지가 예약되어 있어 결제되지 않고, 무료 플랜으로 바뀌어요.${tail}`
      }
      return `[첫수업] 스탠다드 무료 체험이 내일 ${lastDay}에 끝나요. 끝나면 무료 플랜으로 바뀌어요. 계속 쓰려면 오늘 플랜·결제에서 카드를 등록해 주세요.${tail}`
    case "trial_ended_free":
      return `[첫수업] 스탠다드 무료 체험이 끝나 무료 플랜으로 바뀌었어요. 쌓인 기록과 보낸 리포트는 그대로예요. 스탠다드는 플랜·결제에서 다시 시작할 수 있어요.${tail}`
    case "trial_first_charge_succeeded":
      return input.nextChargeAt
        ? `[첫수업] 스탠다드 ${price}이 결제됐어요. 다음 결제일은 ${dateOf(input.nextChargeAt)}이에요.${tail}`
        : `[첫수업] 스탠다드 ${price}이 결제됐어요.${tail}`
    case "trial_first_charge_failed":
      return input.gracePeriodEnd
        ? `[첫수업] 스탠다드 ${price} 결제가 되지 않았어요. 매일 한 번 다시 결제해 볼게요. 카드 한도와 상태를 확인해 주세요. ${dayBefore(input.gracePeriodEnd)}까지 결제되지 않으면 무료 플랜으로 바뀌어요.${tail}`
        : `[첫수업] 스탠다드 ${price} 결제가 되지 않았어요. 플랜·결제에서 카드를 확인해 주세요.${tail}`
  }
}

// ─────────────────────────────────────────────────────────────
// 받는 번호: 학원 담당자 → 학원 대표 → 승인된 가입 신청의 담당자
// ─────────────────────────────────────────────────────────────

export const resolveTrialNoticeRecipient = (input: {
  organizationContactPhone: string | null
  organizationAcademyPhone: string | null
  signupContactPhone: string | null
}): { phone: string; source: "organization_contact" | "organization_academy" | "signup_contact" } | null => {
  const contact = input.organizationContactPhone?.trim()
  if (contact) return { phone: contact, source: "organization_contact" }
  const academy = input.organizationAcademyPhone?.trim()
  if (academy) return { phone: academy, source: "organization_academy" }
  const signup = input.signupContactPhone?.trim()
  if (signup) return { phone: signup, source: "signup_contact" }
  return null
}
