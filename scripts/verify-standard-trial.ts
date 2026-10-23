// 스탠다드 90일 무료 체험 규칙 검증(순수 함수 · DB 없음).
//
//   npx tsx scripts/verify-standard-trial.ts
//
// 여기서 고정하는 것.
//   1. 종료 시각 = (승인일 KST + 90일) 00:00 KST — 경계(23:59 · 00:00 · 월말 · 윤년)
//   2. 마지막 체험일 = 종료 시각 전날 · 남은 일수(승인 당일 90 · 마지막 날 1)
//   3. 카드 등록 창 = [종료 - 30일, 종료) — 창 밖 동의는 인정하지 않는다
//   4. 첫 결제는 마지막 체험일(KST)에만 · 해지 예약 · 카드 없음 · 동의 없음 · 수동 trialing 은 제외
//   5. 첫 결제 기준일 = 종료 시각(KST)의 일
//   6. 화면 모델: 상태(카드 전 · 등록됨 · 해지 예약) · 상단 안내 14일 · 끝난 체험은 null

import {
  STANDARD_TRIAL_DAYS,
  TRIAL_BANNER_DAYS,
  TRIAL_CARD_WINDOW_DAYS,
  buildStandardTrialView,
  daysLeftInTrial,
  decideTrialFirstCharge,
  formatKstDateLabel,
  isTrialConsentValid,
  isWithinTrialCardWindow,
  resolveStandardTrialPeriodEnd,
  resolveTrialCardWindowStart,
  resolveTrialFirstChargeAnchorDay,
  resolveTrialLastDayKey,
  type TrialFirstChargeSubject
} from "@/features/billing/lib/standard-trial"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { buildRenewalBillingPeriod } from "@/features/billing/lib/billing-period"
import { resolveStudioEntitlements } from "@/features/billing/lib/entitlements"
import { decideRenewal } from "@/features/billing/lib/renewal/renewal-schedule"
import { buildRenewalBillingAttempt, buildTrialFirstChargeAttempt } from "@/features/billing/lib/toss/identifiers"
import { TOSS_ORDER_ID_MAX_LENGTH, TOSS_ORDER_ID_PATTERN } from "@/features/billing/lib/toss/contract"
import { checkTrialCardRegistration } from "@/features/billing/lib/standard-trial"
import { buildTrialBannerMessage, describeTrialStatus } from "@/features/billing/lib/standard-trial"
import {
  buildNextBillingFact,
  buildPricingCards,
  resolveBillingPresentation
} from "@/features/billing/lib/subscription-presentation"
import { buildStudioSidebarPlan } from "@/features/studio/lib/studio-sidebar-plan"
import type { OrganizationSubscription } from "@/shared/lib/db/adapter"

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}
const at = (iso: string) => new Date(iso)
const HOUR = 60 * 60 * 1000

console.log("[1] 종료 시각")
check("상수: 90일 · 카드 창 30일 · 상단 안내 14일", STANDARD_TRIAL_DAYS === 90 && TRIAL_CARD_WINDOW_DAYS === 30 && TRIAL_BANNER_DAYS === 14)
const cases: Array<[string, string, string]> = [
  ["10-23 23:59 KST 승인", "2026-10-23T14:59:00Z", "2027-01-20T15:00:00.000Z"],
  ["10-24 00:00 KST 승인", "2026-10-23T15:00:00Z", "2027-01-21T15:00:00.000Z"],
  ["10-24 00:00 직전(10-23 23:59:59.999 KST)", "2026-10-23T14:59:59.999Z", "2027-01-20T15:00:00.000Z"],
  ["월말 11-30 23:00 KST", "2026-11-30T14:00:00Z", "2027-02-27T15:00:00.000Z"],
  ["윤년 2027-12-01 → 2028-02-29", "2027-12-01T00:00:00Z", "2028-02-28T15:00:00.000Z"],
  ["윤년 2028-02-29 승인", "2028-02-29T05:00:00Z", "2028-05-28T15:00:00.000Z"]
]
for (const [label, approvedAt, expected] of cases) {
  const actual = resolveStandardTrialPeriodEnd(at(approvedAt)).toISOString()
  check(label, actual === expected, `${actual}`)
}

console.log("\n[2] 마지막 체험일 · 남은 일수")
{
  const approvedAt = at("2026-10-23T05:00:00Z") // 10-23 14:00 KST
  const end = resolveStandardTrialPeriodEnd(approvedAt) // 2027-01-21 00:00 KST
  check("마지막 체험일 = 종료 전날(KST)", resolveTrialLastDayKey(end) === "2027-01-20", resolveTrialLastDayKey(end))
  check("날짜 표기에 요일이 붙는다", formatKstDateLabel("2027-01-20") === "1월 20일(수)", formatKstDateLabel("2027-01-20"))
  check("승인 당일 남은 일수 90", daysLeftInTrial(end, approvedAt) === 90, String(daysLeftInTrial(end, approvedAt)))
  check("승인 당일 23:59 KST 도 90", daysLeftInTrial(end, at("2026-10-23T14:59:00Z")) === 90)
  check("다음 날 00:00 KST 는 89", daysLeftInTrial(end, at("2026-10-23T15:00:00Z")) === 89)
  check("마지막 체험일 23:59 KST 는 1", daysLeftInTrial(end, at("2027-01-20T14:59:00Z")) === 1)
  check("종료 시각에는 0", daysLeftInTrial(end, end) === 0)
  // 체험 일수가 정확히 90일인가: 승인일 ~ 마지막 체험일
  const days = Math.round((Date.parse("2027-01-20T00:00:00Z") - Date.parse("2026-10-23T00:00:00Z")) / (24 * HOUR)) + 1
  check("승인일을 1일째로 세면 마지막 체험일이 90일째다", days === 90, String(days))
}

console.log("\n[3] 카드 등록 창")
{
  const end = at("2027-01-20T15:00:00Z") // 2027-01-21 00:00 KST
  const start = resolveTrialCardWindowStart(end)
  check("창 시작 = 종료 - 30일(KST 자정)", start.toISOString() === "2026-12-21T15:00:00.000Z", start.toISOString())
  check("창 시작 1ms 전은 닫혀 있다", !isWithinTrialCardWindow(end, new Date(start.getTime() - 1)))
  check("창 시작 시각에 열린다", isWithinTrialCardWindow(end, start))
  check("종료 1ms 전까지 열려 있다", isWithinTrialCardWindow(end, new Date(end.getTime() - 1)))
  check("종료 시각에는 닫힌다", !isWithinTrialCardWindow(end, end))
  check("창 밖(31일 전) 동의는 인정하지 않는다", !isTrialConsentValid(end, new Date(start.getTime() - HOUR).toISOString()))
  check("창 안 동의는 인정한다", isTrialConsentValid(end, new Date(start.getTime() + HOUR).toISOString()))
  check("동의가 없으면 인정하지 않는다", !isTrialConsentValid(end, null))
}

console.log("\n[4] 첫 결제 시점")
{
  const end = "2027-01-20T15:00:00.000Z" // 2027-01-21 00:00 KST, 마지막 체험일 01-20
  const base: TrialFirstChargeSubject = {
    subscriptionStatus: "trialing",
    trialOrigin: "signup_approval",
    trialEndsAt: end,
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    consentedAt: "2027-01-01T03:00:00.000Z",
    hasActiveBillingKey: true
  }
  const lastDayNoon = at("2027-01-20T03:00:00Z") // 01-20 12:00 KST
  const describe = (subject: TrialFirstChargeSubject, now: Date) => {
    const decision = decideTrialFirstCharge(subject, now)
    return decision.due ? "due" : decision.reason
  }
  check("마지막 체험일 12:00 KST 크론 → 결제", describe(base, lastDayNoon) === "due")
  check("마지막 체험일 00:00 KST → 결제", describe(base, at("2027-01-19T15:00:00Z")) === "due")
  check("전날 23:59 KST → 아직", describe(base, at("2027-01-19T14:59:00Z")) === "not_last_day_yet")
  check("종료 시각 이후 → 결제하지 않는다(무료 전환)", describe(base, at("2027-01-21T03:00:00Z")) === "trial_ended")
  check("해지 예약 → 결제하지 않는다", describe({ ...base, cancelAtPeriodEnd: true }, lastDayNoon) === "cancel_at_period_end")
  check("카드 없음 → 결제하지 않는다", describe({ ...base, hasActiveBillingKey: false }, lastDayNoon) === "no_billing_key")
  check("동의 없음 → 결제하지 않는다", describe({ ...base, consentedAt: null }, lastDayNoon) === "no_consent_in_window")
  check(
    "창 밖(종료 31일 전) 동의 → 결제하지 않는다",
    describe({ ...base, consentedAt: "2026-12-20T15:00:00.000Z" }, lastDayNoon) === "no_consent_in_window"
  )
  check(
    "수동 trialing(PoC, trial_origin 없음) → 결제하지 않는다",
    describe({ ...base, trialOrigin: null }, lastDayNoon) === "not_auto_trial"
  )
  check("active 구독은 이 규칙의 대상이 아니다", describe({ ...base, subscriptionStatus: "active" }, lastDayNoon) === "not_auto_trial")
  check(
    "체험 기간이 바뀌어 있으면(수동 조정) 결제하지 않는다",
    describe({ ...base, currentPeriodEnd: "2027-02-20T15:00:00.000Z" }, lastDayNoon) === "period_mismatch"
  )
}

console.log("\n[5] 첫 결제 기준일")
check("종료 2027-01-21 00:00 KST → 21일", resolveTrialFirstChargeAnchorDay(at("2027-01-20T15:00:00Z")) === 21)
check("종료 2028-02-29 00:00 KST → 29일", resolveTrialFirstChargeAnchorDay(at("2028-02-28T15:00:00Z")) === 29)

console.log("\n[6] 화면 모델")
{
  const end = "2027-01-20T15:00:00.000Z"
  const subscription = (overrides: Partial<OrganizationSubscription> = {}): OrganizationSubscription => ({
    organizationId: "org-1",
    planCode: "standard",
    status: "trialing",
    currentPeriodStart: "2026-10-23T05:00:00.000Z",
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    gracePeriodEnd: null,
    trialOrigin: "signup_approval",
    trialEndsAt: end,
    ...overrides
  })
  const d40 = at("2026-12-12T03:00:00Z") // 남은 40일
  const d20 = at("2027-01-01T03:00:00Z") // 남은 20일
  const d10 = at("2027-01-11T03:00:00Z") // 남은 10일
  const view40 = buildStandardTrialView(subscription(), { now: d40, hasActiveBillingMethod: false, consentedAt: null })
  check("D-40: 카드 전 · 창 닫힘 · 안내 없음", view40?.state === "no_card" && view40.daysLeft === 40 && !view40.cardWindowOpen && !view40.bannerVisible, JSON.stringify(view40 && { d: view40.daysLeft, w: view40.cardWindowOpen }))
  check("D-40: 창 여는 날 = 12월 22일(화)", view40?.cardWindowStartLabel === "12월 22일(화)", view40?.cardWindowStartLabel)
  check("끝나는 날 = 1월 20일(수)", view40?.lastDayLabel === "1월 20일(수)", view40?.lastDayLabel)
  const view20 = buildStandardTrialView(subscription(), { now: d20, hasActiveBillingMethod: false, consentedAt: null })
  check("D-20: 카드 전 · 창 열림 · 안내 없음", view20?.state === "no_card" && view20.cardWindowOpen && !view20.bannerVisible)
  const registered = buildStandardTrialView(subscription(), { now: d10, hasActiveBillingMethod: true, consentedAt: "2026-12-31T03:00:00.000Z" })
  check("D-10: 카드 등록됨 · 상단 안내", registered?.state === "card_registered" && registered.bannerVisible)
  const oldCard = buildStandardTrialView(subscription(), { now: d10, hasActiveBillingMethod: true, consentedAt: null })
  check("동의 없는 예전 카드는 '등록됨'이 아니다", oldCard?.state === "no_card")
  const canceled = buildStandardTrialView(subscription({ cancelAtPeriodEnd: true }), { now: d10, hasActiveBillingMethod: true, consentedAt: "2026-12-31T03:00:00.000Z" })
  check("해지 예약", canceled?.state === "cancel_scheduled")
  check("상단 안내는 14일 남았을 때부터", buildStandardTrialView(subscription(), { now: at("2027-01-06T15:00:00Z"), hasActiveBillingMethod: false, consentedAt: null })?.bannerVisible === true &&
    buildStandardTrialView(subscription(), { now: at("2027-01-06T14:59:00Z"), hasActiveBillingMethod: false, consentedAt: null })?.bannerVisible === false)
  check("수동 trialing 은 null", buildStandardTrialView(subscription({ trialOrigin: null, trialEndsAt: null }), { now: d10, hasActiveBillingMethod: false, consentedAt: null }) === null)
  check("끝난 체험은 null", buildStandardTrialView(subscription(), { now: at(end), hasActiveBillingMethod: false, consentedAt: null }) === null)
  check("active 구독은 null", buildStandardTrialView(subscription({ status: "active" }), { now: d10, hasActiveBillingMethod: true, consentedAt: null }) === null)
}

console.log("\n[7] 플랜·결제 · 사이드바 · 상단 안내 문구")
{
  const end = "2027-01-20T15:00:00.000Z" // 마지막 체험일 1월 20일(수)
  const sub = (overrides: Partial<OrganizationSubscription> = {}): OrganizationSubscription => ({
    organizationId: "org-1",
    planCode: "standard",
    status: "trialing",
    currentPeriodStart: "2026-10-23T05:00:00.000Z",
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    gracePeriodEnd: null,
    trialOrigin: "signup_approval",
    trialEndsAt: end,
    ...overrides
  })
  const AMOUNT = 39000
  const present = (subscription: OrganizationSubscription, now: Date, card: boolean, consentedAt: string | null) => {
    const trial = buildStandardTrialView(subscription, { now, hasActiveBillingMethod: card, consentedAt })
    const resolved = resolveStudioEntitlements({ subscription, override: null }, now)
    const presentation = resolveBillingPresentation({ resolved, subscription, hasActiveBillingMethod: card, standardAmount: AMOUNT, trial })
    return { trial, presentation, cards: buildPricingCards(presentation, { billingAvailable: true, standardAmount: AMOUNT }), fact: buildNextBillingFact(presentation) }
  }
  const d40 = present(sub(), at("2026-12-12T03:00:00Z"), false, null)
  const standard40 = d40.cards.find((card) => card.planCode === "standard")!
  check("D-40: 배지 '무료 체험 중'", d40.presentation.statusBadge.label === "무료 체험 중")
  check(
    "D-40: 스탠다드 버튼은 잠기고 여는 날짜를 말한다",
    standard40.cta.kind === "disabled" && standard40.cta.note === "12월 22일(화)부터 카드를 등록할 수 있어요.",
    `${standard40.cta.kind} ${standard40.cta.note}`
  )
  check("D-40: 무료 카드 '체험이 끝나면 자동 전환'", d40.cards.find((card) => card.planCode === "free")!.cta.label === "체험이 끝나면 자동 전환")
  check("체험 중에도 스탠다드 카드가 추천(featured)이다", standard40.featured)
  check("D-40: 해지 · 해지 취소 없음", !d40.presentation.canCancel && !d40.presentation.canResume)
  check("D-40: 다음 결제 줄 = 체험 종료 · 금액 없음", d40.fact.title === "체험 종료" && d40.fact.value === "1월 20일(수)" && d40.fact.caption === "카드가 없으면 무료 플랜으로 바뀌어요")
  check(
    "D-40: 상태 설명",
    describeTrialStatus(d40.trial!, AMOUNT) === "1월 20일(수)까지 모든 기능을 써요. 끝나면 카드 등록이 없을 때 자동으로 무료 플랜이 되고, 기록·리포트는 그대로 남아요."
  )
  check("D-40: 상단 안내 없음", buildTrialBannerMessage(d40.trial, AMOUNT) === null)

  const d20 = present(sub(), at("2027-01-01T03:00:00Z"), false, null)
  check("D-20: 스탠다드 버튼 = 카드 등록(계속 쓰기)", d20.cards.find((card) => card.planCode === "standard")!.cta.kind === "register_card")

  const registered = present(sub(), at("2027-01-11T03:00:00Z"), true, "2027-01-01T03:00:00.000Z")
  check("등록됨: 다음 결제 줄 = 첫 결제 · 1월 20일(수) · 39,000원", registered.fact.title === "첫 결제" && registered.fact.value === "1월 20일(수)" && registered.fact.caption === "39,000원")
  check("등록됨: 자동 결제 해지 가능", registered.presentation.canCancel && !registered.presentation.canResume)
  check("등록됨: 스탠다드 카드 '1월 20일(수) 첫 결제'", registered.cards.find((card) => card.planCode === "standard")!.cta.label === "1월 20일(수) 첫 결제")
  check(
    "등록됨: 상단 안내",
    buildTrialBannerMessage(registered.trial, AMOUNT) === "스탠다드 무료 체험이 1월 20일(수)에 끝나요. 1월 20일(수)에 39,000원이 결제돼요."
  )
  check(
    "등록됨: 상태 설명",
    describeTrialStatus(registered.trial!, AMOUNT) === "1월 20일(수)까지 무료로 쓰고, 1월 20일(수)에 39,000원이 결제돼요. 그 뒤로는 매월 자동 결제돼요."
  )

  const canceled = present(sub({ cancelAtPeriodEnd: true }), at("2027-01-11T03:00:00Z"), true, "2027-01-01T03:00:00.000Z")
  check("해지 예약: 배지 '해지 예정' · 해지 취소 가능", canceled.presentation.statusBadge.label === "해지 예정" && canceled.presentation.canResume && !canceled.presentation.canCancel)
  check("해지 예약: 금액을 말하지 않는다", canceled.fact.caption === "해지 예정 · 결제되지 않아요" && canceled.presentation.monthlyAmount === null)
  check(
    "해지 예약: 상단 안내",
    buildTrialBannerMessage(canceled.trial, AMOUNT) === "스탠다드 무료 체험이 1월 20일(수)에 끝나요. 그 뒤 무료 플랜으로 바뀌어요."
  )
  const noCard14 = present(sub(), at("2027-01-06T15:00:00Z"), false, null)
  check(
    "카드 없음 · 14일: 상단 안내",
    buildTrialBannerMessage(noCard14.trial, AMOUNT) === "스탠다드 무료 체험이 1월 20일(수)에 끝나요. 카드를 등록하지 않으면 무료 플랜으로 바뀌어요."
  )

  // 수동 trialing(PoC)은 기존 문구 그대로다.
  const poc = present(sub({ trialOrigin: null, trialEndsAt: null }), at("2027-01-11T03:00:00Z"), false, null)
  check("수동 trialing 은 기존 '체험 이용 중'", poc.trial === null && poc.presentation.statusBadge.label === "체험 이용 중")

  // 사이드바: 승인 당일 90일 남음
  const sidebar = buildStudioSidebarPlan({ subscription: sub(), override: null }, at("2026-10-23T05:00:00Z"))
  check("사이드바: 승인 당일 '스탠다드 무료 체험 · 90일 남음'", sidebar.label === "스탠다드 무료 체험" && sidebar.trial?.daysLeft === 90, `${sidebar.label} ${sidebar.trial?.daysLeft}`)
  const sidebarLast = buildStudioSidebarPlan({ subscription: sub(), override: null }, at("2027-01-20T14:00:00Z"))
  check("사이드바: 마지막 체험일 1일 남음", sidebarLast.trial?.daysLeft === 1)
}

console.log("\n[8] 카드 등록(자동 결제 동의)")
{
  const end = "2027-01-20T15:00:00.000Z"
  const sub = (overrides: Partial<OrganizationSubscription> = {}): OrganizationSubscription => ({
    organizationId: "org-1",
    planCode: "standard",
    status: "trialing",
    currentPeriodStart: "2026-10-23T05:00:00.000Z",
    currentPeriodEnd: end,
    cancelAtPeriodEnd: false,
    gracePeriodEnd: null,
    trialOrigin: "signup_approval",
    trialEndsAt: end,
    ...overrides
  })
  const run = (subscription: OrganizationSubscription | null, now: string, extra: Partial<{ card: boolean; consentedAt: string | null; already: boolean }> = {}) => {
    const result = checkTrialCardRegistration(subscription, {
      now: at(now),
      hasActiveBillingMethod: extra.card ?? false,
      consentedAt: extra.consentedAt ?? null,
      checkAlreadyRegistered: extra.already ?? true
    })
    return result.ok ? "ok" : result.code
  }
  check("창 열리기 전(31일 전) → window_not_open", run(sub(), "2026-12-21T14:59:00Z") === "window_not_open")
  check(
    "창 열리기 전 문구에 여는 날짜",
    (() => {
      const result = checkTrialCardRegistration(sub(), { now: at("2026-12-01T03:00:00Z"), hasActiveBillingMethod: false, consentedAt: null, checkAlreadyRegistered: true })
      return !result.ok && result.message === "카드는 12월 22일(화)부터 등록할 수 있어요."
    })()
  )
  check("창 시작 시각(30일 전 00:00 KST) → ok", run(sub(), "2026-12-21T15:00:00Z") === "ok")
  check("마지막 체험일 → ok", run(sub(), "2027-01-20T10:00:00Z") === "ok")
  check("종료 시각 → trial_ended", run(sub(), end) === "trial_ended")
  check("해지 예약 → cancel_scheduled", run(sub({ cancelAtPeriodEnd: true }), "2027-01-10T03:00:00Z") === "cancel_scheduled")
  check("수동 trialing → not_auto_trial", run(sub({ trialOrigin: null, trialEndsAt: null }), "2027-01-10T03:00:00Z") === "not_auto_trial")
  check("구독 없음(무료) → not_auto_trial", run(null, "2027-01-10T03:00:00Z") === "not_auto_trial")
  check(
    "이미 등록(카드 + 창 안 동의) → already_registered (시작할 때만)",
    run(sub(), "2027-01-10T03:00:00Z", { card: true, consentedAt: "2027-01-01T03:00:00.000Z" }) === "already_registered" &&
      run(sub(), "2027-01-10T03:00:00Z", { card: true, consentedAt: "2027-01-01T03:00:00.000Z", already: false }) === "ok"
  )
  check("동의 없는 예전 카드는 다시 등록할 수 있다", run(sub(), "2027-01-10T03:00:00Z", { card: true, consentedAt: null }) === "ok")

  // 소스 계약: 서버가 동의 · 창을 다시 보고, 카드 등록 경로는 결제를 만들지 않는다.
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
  const start = read("src/features/billing/actions/start-trial-card-registration.ts")
  check("시작: 동의(agreed)가 없으면 결제창을 열지 않는다", /input\?\.agreed !== true/.test(start))
  check("시작: 서버에서 체험 · 창을 판정한다", start.includes("checkTrialCardRegistration(") && start.includes("checkAlreadyRegistered: true"))
  check("시작: 세션 purpose = register_card", start.includes('purpose: "register_card"'))
  check("시작: 로컬 가드를 거친 Toss runtime 만 쓴다", start.includes("getTossRuntimeForOrganization(access.organizationId)"))
  const complete = read("src/features/billing/actions/complete-standard-checkout.ts")
  const branchAt = complete.indexOf('checked.session.purpose === "register_card"')
  const chargeAt = complete.indexOf("await chargeSubscription(")
  check("완료: 카드 등록 분기가 결제 호출보다 먼저 끝난다", branchAt > 0 && chargeAt > branchAt)
  const registerFn = complete.slice(complete.indexOf("const completeTrialCardRegistration"))
  check("완료: 카드 등록 함수는 결제를 만들지 않는다", !registerFn.includes("chargeSubscription") && !registerFn.includes("applyVerifiedBillingEvent"))
  check("완료: 빌링키 발급 전에 체험 · 창을 다시 본다", registerFn.indexOf("checkTrialCardRegistration(") < registerFn.indexOf("issueTossBillingKey("))
  check("완료: 세션은 기준일 없이 완료된다(anchor_day null)", registerFn.includes("markCheckoutSessionCompleted(session.id, null, claimed)"))
  const ui = read("src/features/billing/ui/trial-card-registration.tsx")
  check("화면: 동의 전에는 [카드 등록하기]를 누를 수 없다", ui.includes("disabled={!agreed || pending}"))
  check("화면: 결제일 · 금액 · 자동 결제 · 해지를 말한다", ui.includes("매월 자동 결제") && ui.includes("그 전에 해지하면 결제되지 않아요") && ui.includes("첫 결제일"))
}

console.log("\n[9] 첫 결제 실행(갱신 크론)")
{
  const ORG = "0f000000-0000-4000-8000-0000000000aa"
  const end = "2027-01-20T15:00:00.000Z" // 2027-01-21 00:00 KST
  const first = buildTrialFirstChargeAttempt(ORG, end)
  check("주문번호가 Toss 규칙을 지킨다", TOSS_ORDER_ID_PATTERN.test(first.orderId) && first.orderId.length <= TOSS_ORDER_ID_MAX_LENGTH, first.orderId)
  check("같은 (조직, 종료)면 같은 키(크론 중복 · 재시도에 결제 한 번)", JSON.stringify(first) === JSON.stringify(buildTrialFirstChargeAttempt(ORG, end)))
  const retry = buildRenewalBillingAttempt(ORG, end, 0)
  check(
    "첫 결제 실패 뒤 유예 재시도(a0)와 키가 겹치지 않는다",
    first.orderId !== retry.orderId && first.attemptKey !== retry.attemptKey && first.idempotencyKey !== retry.idempotencyKey
  )

  const period = buildRenewalBillingPeriod(at(end), resolveTrialFirstChargeAnchorDay(at(end)))
  check("새 기간은 체험 종료 시각부터", period.periodStart === end)
  check("새 기간 끝 = 한 달 뒤 같은 날 00:00 KST(2027-02-21)", period.periodEnd === "2027-02-20T15:00:00.000Z", period.periodEnd)
  check("기준일 21일", period.anchorDay === 21)
  const monthEnd = buildRenewalBillingPeriod(at("2027-03-30T15:00:00.000Z"), resolveTrialFirstChargeAnchorDay(at("2027-03-30T15:00:00.000Z")))
  check("월말 종료(3월 31일 00:00 KST) → 4월 30일 00:00 KST, 기준일 31", monthEnd.periodEnd === "2027-04-29T15:00:00.000Z" && monthEnd.anchorDay === 31, monthEnd.periodEnd)

  // 첫 결제 실패 → past_due(유예 = 종료 + 3일). 그 뒤 재시도는 기존 갱신 규칙이 한다.
  const pastDue = { subscriptionStatus: "past_due", currentPeriodEnd: end, gracePeriodEnd: "2027-01-23T15:00:00.000Z", cancelAtPeriodEnd: false }
  const retryAt = (iso: string) => {
    const decision = decideRenewal(pastDue, at(iso))
    return decision.due ? `a${decision.attemptNumber}` : decision.reason
  }
  check("종료 다음 날 12:00 KST → 재시도 a0", retryAt("2027-01-21T03:00:00Z") === "a0")
  check("이틀째 12:00 KST → 재시도 a1", retryAt("2027-01-22T03:00:00Z") === "a1")
  check("사흘째 12:00 KST → 재시도 a2(유예는 1월 24일 00:00 KST까지)", retryAt("2027-01-23T03:00:00Z") === "a2")
  check("나흘째 → 유예 끝(무료)", retryAt("2027-01-24T03:00:00Z") === "grace_over")
  // 체험 중(trialing)은 기존 갱신 규칙의 대상이 아니다 — 첫 결제는 위 규칙만 한다.
  check(
    "trialing 은 기존 갱신 규칙으로 결제되지 않는다",
    !decideRenewal({ subscriptionStatus: "trialing", currentPeriodEnd: end, gracePeriodEnd: null, cancelAtPeriodEnd: false }, at("2027-01-21T03:00:00Z")).due
  )

  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
  const candidates = read("src/features/billing/lib/renewal/renewal-candidates.ts")
  const trialQuery = candidates.slice(candidates.indexOf("export const findTrialFirstChargeCandidates"))
  check("후보: 해지 예약(cancel_at_period_end) 제외를 조회에서 고정한다", trialQuery.includes('.eq("cancel_at_period_end", false)'))
  check("후보: 자동 체험만 고른다", trialQuery.includes('.eq("trial_origin", "signup_approval")') && trialQuery.includes('.eq("subscription_status", "trialing")'))
  check("후보: 동의는 register_card 완료 세션에서 읽는다", trialQuery.includes('.eq("purpose", "register_card")') && trialQuery.includes('.eq("status", "completed")'))
  check("후보: 활성 카드만", trialQuery.includes('.eq("billing_key_status", "active")'))
  const renewals = read("src/features/billing/actions/run-billing-renewals.ts")
  const trialRun = renewals.slice(renewals.indexOf("// ── 스탠다드 무료 체험 첫 결제"))
  check("실행: decideTrialFirstCharge 가 due 일 때만 결제한다", trialRun.includes("decideTrialFirstCharge(candidate, now)") && trialRun.indexOf("decideTrialFirstCharge") < trialRun.indexOf("chargeSubscription("))
  check("실행: 금액은 카탈로그", trialRun.includes("amount: plan.amount") && trialRun.includes("BILLING_PLANS.standard"))
  check("실행: renewal_succeeded · 기준일 = 종료 시각(KST)의 일", trialRun.includes('eventType: "renewal_succeeded"') && trialRun.includes("resolveTrialFirstChargeAnchorDay(trialEndsAt)"))
  check("실행: 로컬 가드를 거친 runtime 이 ready 일 때만", renewals.includes('if (runtime.status !== "ready")') && renewals.indexOf('if (runtime.status !== "ready")') < renewals.indexOf("findTrialFirstChargeCandidates(now)"))
}

console.log("\n[10] 환불 정책 · 파트너 랜딩의 체험 조항")
{
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
  const refund = read("app/(legal)/refund-policy/page.tsx")
  check("환불 정책: 무료 체험 조항이 있다", refund.includes('title: "제3조 (Standard 무료 체험)"'))
  check(
    "환불 정책: 일수는 코드 상수에서 읽는다(90 · 30 · 3)",
    refund.includes("{STANDARD_TRIAL_DAYS}일 동안") && refund.includes("체험 종료 {TRIAL_CARD_WINDOW_DAYS}일 전부터") && refund.includes("{BILLING_GRACE_PERIOD_DAYS}일 동안")
  )
  check(
    "환불 정책: 동의 · 등록 시 결제 없음 · 마지막 날 결제 · 그 전 해지 시 결제 없음 · 자동 전환",
    refund.includes("이에 동의한 경우에만 등록") &&
      refund.includes("등록 시점에는") &&
      refund.includes("체험 마지막 날에 첫 이용료가 결제") &&
      refund.includes("결제 전에 해지하면 결제되지 않으며") &&
      refund.includes("자동으로 Free 플랜으로")
  )
  check("환불 정책: 조항 번호가 이어진다(제1~8조)", [1, 2, 3, 4, 5, 6, 7, 8].every((n) => refund.includes(`title: "제${n}조 (`)) && !refund.includes("제9조"))
  check("환불 정책: 해지 조항의 환불 참조가 제5조 제4항으로 옮겨졌다", refund.includes("제5조 제4항") && !refund.includes("제4조 제4항"))
  const landing = read("app/partner/PartnerLanding.tsx")
  check("랜딩: 체험 일수 · 카드 창 · 유예는 코드 상수", landing.includes("STANDARD_TRIAL_DAYS") && landing.includes("TRIAL_CARD_WINDOW_DAYS") && landing.includes("BILLING_GRACE_PERIOD_DAYS"))
  check("랜딩: 가격은 카탈로그(리터럴 49,000 · 39,000 없음)", !/[34]9,000/.test(landing) && landing.includes("BILLING_PLANS.standard.amount"))
  check("랜딩: 부가세 · 인원 제한 문구 없음", !landing.includes("부가세") && !/선생님\s*\d+\s*명까지/.test(landing))
  check("랜딩: 카드 등록 동의 뒤에만 결제 · 그 전 해지 시 결제 없음", landing.includes("동의한 경우에만") && landing.includes("그 전에 해지하면 결제되지 않습니다"))
}

if (failures > 0) {
  console.error(`FAIL: 체험 규칙 검증 실패 ${failures}건`)
  process.exit(1)
}
console.log("\nPASS: 체험 규칙 검증 완료")
