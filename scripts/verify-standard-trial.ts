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

if (failures > 0) {
  console.error(`FAIL: 체험 규칙 검증 실패 ${failures}건`)
  process.exit(1)
}
console.log("\nPASS: 체험 규칙 검증 완료")
