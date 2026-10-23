// 스탠다드 90일 무료 체험의 날짜 · 창 · 첫 결제 규칙.
//
// 순수 함수만 둔다. 화면(플랜·결제 · 사이드바 · 상단 안내) · 카드 등록 · 갱신 크론 · 알림 크론이
// 모두 여기서 날짜를 읽는다 — 한 곳이 하루 어긋나면 "M월 D일에 결제돼요" 와 실제 결제일이 갈린다.
//
// 기준(AGENTS.md 요금제 정책)
//   종료 시각  = (승인일 KST + 90일) 00:00 KST. SQL standard_trial_period_end() 와 같다.
//   마지막 체험일 = 종료 시각 전날(KST). 화면 · 문자의 "M월 D일까지 / M월 D일에 끝나요" 의 D.
//   남은 일수  = 종료일 - 오늘(KST 날짜). 승인 당일 90, 마지막 체험일 1.
//   카드 등록 창 = [종료 - 30일, 종료). 전자상거래법 무료→유료 전환 동의 규정.
//   첫 결제    = 마지막 체험일(KST)의 갱신 크론. 새 기간은 종료 시각부터.
//
// 한국은 일광절약시간이 없어 KST 자정은 언제나 15:00 UTC 다.

import type { OrganizationSubscription } from "@/shared/lib/db/adapter"

export const STANDARD_TRIAL_DAYS = 90
/** 카드 등록(자동 결제 동의)은 종료 이만큼 전부터만 열린다. */
export const TRIAL_CARD_WINDOW_DAYS = 30
/** Studio 상단 안내는 종료 이만큼 전부터 뜬다. */
export const TRIAL_BANNER_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"]

/** YYYY-MM-DD (KST 날짜) */
export type KstDateKey = string

export const toKstDateKey = (date: Date): KstDateKey => new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)

const keyToUtcMidnight = (key: KstDateKey) => {
  const [year, month, day] = key.split("-").map(Number)
  return Date.UTC(year, month - 1, day)
}

/** KST 날짜 key 의 00:00 KST 시각 */
export const kstMidnight = (key: KstDateKey): Date => new Date(keyToUtcMidnight(key) - KST_OFFSET_MS)

export const addDaysToKey = (key: KstDateKey, days: number): KstDateKey =>
  new Date(keyToUtcMidnight(key) + days * DAY_MS).toISOString().slice(0, 10)

/** to - from (KST 날짜 차이, 일) */
export const diffKstDays = (from: KstDateKey, to: KstDateKey): number =>
  Math.round((keyToUtcMidnight(to) - keyToUtcMidnight(from)) / DAY_MS)

/** "1월 17일(일)" — 날짜 표기 규칙(요일을 함께) */
export const formatKstDateLabel = (key: KstDateKey): string => {
  const utc = new Date(keyToUtcMidnight(key))
  return `${utc.getUTCMonth() + 1}월 ${utc.getUTCDate()}일(${WEEKDAYS[utc.getUTCDay()]})`
}

/** 승인 시각 → 체험 종료 시각. SQL standard_trial_period_end() 와 같아야 한다. */
export const resolveStandardTrialPeriodEnd = (approvedAt: Date): Date =>
  kstMidnight(addDaysToKey(toKstDateKey(approvedAt), STANDARD_TRIAL_DAYS))

/** 마지막 체험일(종료 시각 전날, KST) */
export const resolveTrialLastDayKey = (trialEndsAt: Date): KstDateKey => toKstDateKey(new Date(trialEndsAt.getTime() - 1))

/** 카드 등록 창이 열리는 시각 = 종료 - 30일 */
export const resolveTrialCardWindowStart = (trialEndsAt: Date): Date =>
  new Date(trialEndsAt.getTime() - TRIAL_CARD_WINDOW_DAYS * DAY_MS)

export const isWithinTrialCardWindow = (trialEndsAt: Date, at: Date): boolean =>
  at.getTime() >= resolveTrialCardWindowStart(trialEndsAt).getTime() && at.getTime() < trialEndsAt.getTime()

/** 종료 시각까지 남은 날짜 수(KST). 승인 당일 90, 마지막 체험일 1, 끝나면 0 이하. */
export const daysLeftInTrial = (trialEndsAt: Date, now: Date): number =>
  diffKstDays(toKstDateKey(now), toKstDateKey(trialEndsAt))

const toDate = (value: string | null | undefined) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

// ─────────────────────────────────────────────────────────────
// 자동 체험 판정
// ─────────────────────────────────────────────────────────────

/** 승인 RPC 가 만든 자동 체험이고, 아직 체험 중(trialing)인가. 수동 trialing(PoC)은 false. */
export const isAutoTrialSubscription = (
  subscription: Pick<OrganizationSubscription, "status" | "trialOrigin" | "trialEndsAt"> | null
): subscription is Pick<OrganizationSubscription, "status" | "trialOrigin" | "trialEndsAt"> & { trialEndsAt: string } =>
  Boolean(
    subscription &&
      subscription.status === "trialing" &&
      subscription.trialOrigin === "signup_approval" &&
      toDate(subscription.trialEndsAt)
  )

/**
 * 카드 등록 세션(register_card)의 완료 시각이 자동 결제 동의로 인정되는가.
 * [종료 - 30일, 종료) 안에서 완료된 등록만 인정한다.
 */
export const isTrialConsentValid = (trialEndsAt: Date, consentedAt: string | null | undefined): boolean => {
  const at = toDate(consentedAt)
  return at ? isWithinTrialCardWindow(trialEndsAt, at) : false
}

// ─────────────────────────────────────────────────────────────
// 첫 결제 시점
// ─────────────────────────────────────────────────────────────

export type TrialFirstChargeSubject = {
  subscriptionStatus: string
  trialOrigin: string | null
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  /** 가장 최근에 완료된 register_card 세션의 completed_at */
  consentedAt: string | null
  hasActiveBillingKey: boolean
}

export type TrialFirstChargeSkipReason =
  | "not_auto_trial"
  | "cancel_at_period_end"
  | "no_billing_key"
  | "no_consent_in_window"
  | "period_mismatch"
  | "not_last_day_yet"
  | "trial_ended"

export type TrialFirstChargeDecision =
  | { due: true; trialEndsAt: string }
  | { due: false; reason: TrialFirstChargeSkipReason }

/**
 * 지금 체험 첫 결제를 시도해야 하는가.
 *
 * 마지막 체험일(KST) 00:00 ~ 종료 시각 사이에서만 due 다. 그 날 크론이 돌지 못하면 결제하지 않고
 * 종료 시각에 무료 플랜이 된다(결과 문자 "무료 플랜으로 바뀌었어요").
 * 해지 예약(cancel_at_period_end)은 어떤 경우에도 결제하지 않는다.
 */
export const decideTrialFirstCharge = (subject: TrialFirstChargeSubject, now: Date): TrialFirstChargeDecision => {
  const trialEndsAt = toDate(subject.trialEndsAt)
  if (subject.subscriptionStatus !== "trialing" || subject.trialOrigin !== "signup_approval" || !trialEndsAt) {
    return { due: false, reason: "not_auto_trial" }
  }

  if (subject.cancelAtPeriodEnd) {
    return { due: false, reason: "cancel_at_period_end" }
  }

  if (!subject.hasActiveBillingKey) {
    return { due: false, reason: "no_billing_key" }
  }

  if (!isTrialConsentValid(trialEndsAt, subject.consentedAt)) {
    return { due: false, reason: "no_consent_in_window" }
  }

  // 체험 중 기간이 다른 값으로 바뀌어 있으면(수동 조정 등) 결제하지 않는다. 모르면 닫는다.
  const periodEnd = toDate(subject.currentPeriodEnd)
  if (!periodEnd || periodEnd.getTime() !== trialEndsAt.getTime()) {
    return { due: false, reason: "period_mismatch" }
  }

  if (now.getTime() >= trialEndsAt.getTime()) {
    return { due: false, reason: "trial_ended" }
  }

  if (toKstDateKey(now) < resolveTrialLastDayKey(trialEndsAt)) {
    return { due: false, reason: "not_last_day_yet" }
  }

  return { due: true, trialEndsAt: trialEndsAt.toISOString() }
}

/** 첫 결제가 여는 기간의 월 기준일 = 종료 시각(KST)의 일. */
export const resolveTrialFirstChargeAnchorDay = (trialEndsAt: Date): number =>
  Number(toKstDateKey(trialEndsAt).slice(8, 10))

// ─────────────────────────────────────────────────────────────
// 화면 모델
// ─────────────────────────────────────────────────────────────

export type StandardTrialState = "no_card" | "card_registered" | "cancel_scheduled"

export type StandardTrialView = {
  state: StandardTrialState
  trialEndsAt: string
  /** 마지막 체험일 "1월 17일(일)" — 끝나는 날 · 첫 결제일 */
  lastDayLabel: string
  /** 남은 날짜 수(1 이상) */
  daysLeft: number
  /** 체험 기간 중 지난 비율(0~1). 시작을 모르면 null. */
  elapsedRatio: number | null
  /** 카드 등록 창이 열리는 날 "12월 19일(토)" */
  cardWindowStartLabel: string
  cardWindowOpen: boolean
  /** Studio 상단 안내를 띄우는가(종료 14일 전부터) */
  bannerVisible: boolean
}

/**
 * 자동 체험 중인 구독의 화면 모델. 자동 체험이 아니거나 이미 끝났으면 null.
 *
 * card_registered 는 "활성 카드 + 창 안의 동의" 둘 다 있을 때만이다 — 동의 없이 남아 있는
 * 예전 카드로는 결제하지 않으므로 "결제돼요" 라고 말하지 않는다.
 */
export const buildStandardTrialView = (
  subscription: OrganizationSubscription | null,
  input: { now: Date; hasActiveBillingMethod: boolean; consentedAt: string | null }
): StandardTrialView | null => {
  if (!isAutoTrialSubscription(subscription) || !subscription) return null
  const trialEndsAt = toDate(subscription.trialEndsAt)
  if (!trialEndsAt || input.now.getTime() >= trialEndsAt.getTime()) return null

  const daysLeft = Math.max(1, daysLeftInTrial(trialEndsAt, input.now))
  const start = toDate(subscription.currentPeriodStart)
  const elapsedRatio =
    start && trialEndsAt.getTime() > start.getTime()
      ? Math.min(1, Math.max(0, (input.now.getTime() - start.getTime()) / (trialEndsAt.getTime() - start.getTime())))
      : null
  const windowStart = resolveTrialCardWindowStart(trialEndsAt)

  const state: StandardTrialState = subscription.cancelAtPeriodEnd
    ? "cancel_scheduled"
    : input.hasActiveBillingMethod && isTrialConsentValid(trialEndsAt, input.consentedAt)
      ? "card_registered"
      : "no_card"

  return {
    state,
    trialEndsAt: trialEndsAt.toISOString(),
    lastDayLabel: formatKstDateLabel(resolveTrialLastDayKey(trialEndsAt)),
    daysLeft,
    elapsedRatio,
    cardWindowStartLabel: formatKstDateLabel(toKstDateKey(windowStart)),
    cardWindowOpen: isWithinTrialCardWindow(trialEndsAt, input.now),
    bannerVisible: daysLeft <= TRIAL_BANNER_DAYS
  }
}

// ─────────────────────────────────────────────────────────────
// 화면 문구 (STUDIO_DESIGN_SYSTEM.md §5.23 · §5.25)
// ─────────────────────────────────────────────────────────────

const formatWon = (amount: number) => `${new Intl.NumberFormat("ko-KR").format(amount)}원`

/** 플랜·결제 "지금 상태" 카드 설명(Figma 2148:7046) */
export const describeTrialStatus = (view: StandardTrialView, amount: number): string => {
  if (view.state === "card_registered") {
    return `${view.lastDayLabel}까지 무료로 쓰고, ${view.lastDayLabel}에 ${formatWon(amount)}이 결제돼요. 그 뒤로는 매월 자동 결제돼요.`
  }
  if (view.state === "cancel_scheduled") {
    return `${view.lastDayLabel}까지 쓰고 무료 플랜으로 바뀌어요. 결제되지 않아요.`
  }
  return `${view.lastDayLabel}까지 모든 기능을 써요. 끝나면 카드 등록이 없을 때 자동으로 무료 플랜이 되고, 기록·리포트는 그대로 남아요.`
}

/** Studio 상단 안내(§5.25). 종료 14일 전부터만 문구가 있다. */
export const buildTrialBannerMessage = (view: StandardTrialView | null, amount: number): string | null => {
  if (!view || !view.bannerVisible) return null
  const head = `스탠다드 무료 체험이 ${view.lastDayLabel}에 끝나요.`
  if (view.state === "card_registered") return `${head} ${view.lastDayLabel}에 ${formatWon(amount)}이 결제돼요.`
  if (view.state === "cancel_scheduled") return `${head} 그 뒤 무료 플랜으로 바뀌어요.`
  return `${head} 카드를 등록하지 않으면 무료 플랜으로 바뀌어요.`
}

// ─────────────────────────────────────────────────────────────
// 카드 등록(자동 결제 동의) 가능 여부 — 서버가 시작 · 완료 두 번 판정한다
// ─────────────────────────────────────────────────────────────

export type TrialCardRegistrationCheck =
  | { ok: true; trialEndsAt: Date }
  | {
      ok: false
      code: "not_auto_trial" | "cancel_scheduled" | "window_not_open" | "trial_ended" | "already_registered"
      message: string
    }

/**
 * 지금 카드 등록을 시작 · 완료해도 되는가.
 *
 * 창(종료 30일 전 ~ 종료)은 화면이 아니라 여기서 강제한다. 완료(callback) 때도 다시 본다 —
 * 결제창에 머무는 사이 체험이 끝났으면 빌링키를 발급하지 않는다.
 * already_registered 는 시작할 때만 본다(checkAlreadyRegistered).
 */
export const checkTrialCardRegistration = (
  subscription: OrganizationSubscription | null,
  input: { now: Date; hasActiveBillingMethod: boolean; consentedAt: string | null; checkAlreadyRegistered: boolean }
): TrialCardRegistrationCheck => {
  if (!isAutoTrialSubscription(subscription) || !subscription) {
    return { ok: false, code: "not_auto_trial", message: "지금은 카드를 등록할 수 있는 체험 상태가 아니에요." }
  }

  const trialEndsAt = new Date(subscription.trialEndsAt as string)
  if (input.now.getTime() >= trialEndsAt.getTime()) {
    return { ok: false, code: "trial_ended", message: "체험이 끝났어요. 플랜·결제에서 스탠다드를 시작해 주세요." }
  }

  if (subscription.cancelAtPeriodEnd) {
    return { ok: false, code: "cancel_scheduled", message: "해지가 예약되어 있어요. 먼저 해지를 취소해 주세요." }
  }

  if (!isWithinTrialCardWindow(trialEndsAt, input.now)) {
    const opensAt = formatKstDateLabel(toKstDateKey(resolveTrialCardWindowStart(trialEndsAt)))
    return { ok: false, code: "window_not_open", message: `카드는 ${opensAt}부터 등록할 수 있어요.` }
  }

  if (input.checkAlreadyRegistered && input.hasActiveBillingMethod && isTrialConsentValid(trialEndsAt, input.consentedAt)) {
    return { ok: false, code: "already_registered", message: "이미 카드를 등록했어요." }
  }

  return { ok: true, trialEndsAt }
}
