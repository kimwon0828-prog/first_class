// 스탠다드 무료 체험 알림 문자 검증(순수 함수 · DB · 문자 발송 없음).
//
//   npx tsx scripts/verify-trial-notices.ts          검증
//   npx tsx scripts/verify-trial-notices.ts --print  검증 + 종류별 문구 전체 출력
//
// 여기서 고정하는 것.
//   1. 하루씩 90일을 돌려 보면 종류마다 정해진 날에만 due 다(30 · 7 · 1일 전, 종료 뒤 결과)
//   2. 30일 전 알림은 카드 등록 창이 열린 날이고, 이미 등록 · 해지 예약이면 보내지 않는다
//   3. 1일 전은 마지막 체험일 전날("내일")이다 — 결제(마지막 날 12:00)보다 먼저 나간다
//   4. 종료 뒤: 성공 · 실패(유예 중) · 무료 전환을 구분하고, 결과를 모르면(pending) 기다린다
//   5. 해지 예약이면 7 · 1일 전 문구가 해지 예약 문구다
//   6. 받는 번호: 학원 담당자 → 학원 대표 → 승인된 가입 신청 담당자, 없으면 null(skipped)
//   7. 문구: 해요체 · 날짜에 요일 · 금액은 카탈로그 · 플랜·결제 주소
//   8. 작업 소스 계약: 로컬 가드 · claim 먼저 · dry_run · skipped · 크론 시각

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import {
  buildTrialNoticeMessage,
  resolveDueTrialNotice,
  resolveTrialNoticeRecipient,
  type DueTrialNotice,
  type TrialNoticeSubject
} from "@/features/billing/lib/trial-notices"

const PRINT = process.argv.includes("--print")
let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const AMOUNT = BILLING_PLANS.standard.amount
const URL = "https://studio.firstsuup.com/billing"
const END = "2027-01-20T15:00:00.000Z" // 2027-01-21 00:00 KST, 마지막 체험일 1월 20일(수)
const DAY = 24 * 60 * 60 * 1000
// 매일 KST 12:30 (알림 크론)
const cronAt = (kstDate: string) => new Date(`${kstDate}T03:30:00.000Z`)
const kstDays = (from: string, to: string) => {
  const out: string[] = []
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

const subject = (overrides: Partial<TrialNoticeSubject> = {}): TrialNoticeSubject => ({
  status: "trialing",
  trialEndsAt: END,
  cancelAtPeriodEnd: false,
  currentPeriodStart: "2026-10-23T05:00:00.000Z",
  currentPeriodEnd: END,
  gracePeriodEnd: null,
  hasActiveBillingMethod: false,
  consentedAt: null,
  firstChargePending: false,
  ...overrides
})

const timeline = (s: TrialNoticeSubject, from: string, to: string) =>
  kstDays(from, to)
    .map((day) => [day, resolveDueTrialNotice(s, cronAt(day))] as const)
    .filter(([, notice]) => notice)
    .map(([day, notice]) => `${day}:${notice!.kind}${notice!.variant ? `/${notice!.variant}` : ""}`)

console.log("[1] 카드 없는 체험 90일 타임라인")
{
  const lines = timeline(subject(), "2026-10-23", "2027-01-20")
  const expected = [
    "2026-12-22:trial_ends_in_30_days/no_card",
    "2026-12-23:trial_ends_in_30_days/no_card",
    "2026-12-24:trial_ends_in_30_days/no_card",
    "2027-01-13:trial_ends_in_7_days/no_card",
    "2027-01-14:trial_ends_in_7_days/no_card",
    "2027-01-15:trial_ends_in_7_days/no_card",
    "2027-01-19:trial_ends_in_1_day/no_card"
  ]
  check("30일 전(창 여는 날 + 2일 따라잡기) · 7일 전(+2일) · 1일 전(전날)만 due", JSON.stringify(lines) === JSON.stringify(expected), lines.join(" "))
  check("마지막 체험일(결제일) 당일에는 종료 전 알림이 없다", resolveDueTrialNotice(subject(), cronAt("2027-01-20")) === null)
}

console.log("\n[2] 카드 등록 · 해지 예약")
{
  const registered = subject({ hasActiveBillingMethod: true, consentedAt: "2026-12-30T03:00:00.000Z" })
  const lines = timeline(registered, "2026-12-31", "2027-01-20")
  check(
    "카드 등록 뒤에는 30일 전 알림이 없고 7 · 1일 전은 결제 문구",
    JSON.stringify(lines) ===
      JSON.stringify([
        "2027-01-13:trial_ends_in_7_days/card_registered",
        "2027-01-14:trial_ends_in_7_days/card_registered",
        "2027-01-15:trial_ends_in_7_days/card_registered",
        "2027-01-19:trial_ends_in_1_day/card_registered"
      ]),
    lines.join(" ")
  )
  check(
    "창 안(12-22)에 등록했으면 30일 전 따라잡기도 하지 않는다",
    resolveDueTrialNotice(subject({ hasActiveBillingMethod: true, consentedAt: "2026-12-22T03:00:00.000Z" }), cronAt("2026-12-23")) === null
  )
  const canceled = subject({ cancelAtPeriodEnd: true, hasActiveBillingMethod: true, consentedAt: "2026-12-30T03:00:00.000Z" })
  check("해지 예약: 7일 전 문구는 해지 예약", resolveDueTrialNotice(canceled, cronAt("2027-01-13"))?.variant === "cancel_scheduled")
  check("해지 예약: 1일 전 문구는 해지 예약", resolveDueTrialNotice(canceled, cronAt("2027-01-19"))?.variant === "cancel_scheduled")
  check(
    "동의 없는 예전 카드는 '카드 없음' 문구",
    resolveDueTrialNotice(subject({ hasActiveBillingMethod: true, consentedAt: null }), cronAt("2027-01-13"))?.variant === "no_card"
  )
}

console.log("\n[3] 종료 뒤 결과")
{
  const after = cronAt("2027-01-21") // 종료 시각(00:00 KST) 이후 첫 알림 크론
  check("카드 없음 → 무료 전환", resolveDueTrialNotice(subject(), after)?.kind === "trial_ended_free")
  check("해지 예약 → 무료 전환", resolveDueTrialNotice(subject({ cancelAtPeriodEnd: true }), after)?.kind === "trial_ended_free")
  check("종료 시각 전(마지막 날 23:59 KST)에는 결과 문자가 없다", resolveDueTrialNotice(subject(), new Date("2027-01-20T14:59:00Z")) === null)
  const success = subject({ status: "active", currentPeriodStart: END, currentPeriodEnd: "2027-02-20T15:00:00.000Z" })
  check("결제 성공 → 결제 성공", resolveDueTrialNotice(success, after)?.kind === "trial_first_charge_succeeded")
  const failed = subject({ status: "past_due", gracePeriodEnd: "2027-01-23T15:00:00.000Z" })
  check("결제 실패(유예 중) → 결제 실패", resolveDueTrialNotice(failed, after)?.kind === "trial_first_charge_failed")
  check("유예가 끝나면 → 무료 전환", resolveDueTrialNotice(failed, cronAt("2027-01-24"))?.kind === "trial_ended_free")
  check("결과를 모르면(pending) 보내지 않는다", resolveDueTrialNotice(subject({ firstChargePending: true }), after) === null)
  check("종료 4일 뒤부터는 보내지 않는다", resolveDueTrialNotice(subject(), cronAt("2027-01-25")) === null)
  check("알림 키는 체험 종료 시각(첫 결제 뒤에도 같다)", resolveDueTrialNotice(success, after)?.periodEnd === END)
}

console.log("\n[4] 받는 번호")
check(
  "학원 담당자가 먼저",
  resolveTrialNoticeRecipient({ organizationContactPhone: "010-1111-1111", organizationAcademyPhone: "02-222-2222", signupContactPhone: "010-3333-3333" })?.source === "organization_contact"
)
check(
  "담당자가 없으면 학원 대표",
  resolveTrialNoticeRecipient({ organizationContactPhone: " ", organizationAcademyPhone: "02-222-2222", signupContactPhone: "010-3333-3333" })?.source === "organization_academy"
)
check(
  "둘 다 없으면 승인된 가입 신청 담당자",
  resolveTrialNoticeRecipient({ organizationContactPhone: null, organizationAcademyPhone: null, signupContactPhone: "010-3333-3333" })?.source === "signup_contact"
)
check(
  "셋 다 없으면 null(skipped)",
  resolveTrialNoticeRecipient({ organizationContactPhone: null, organizationAcademyPhone: "", signupContactPhone: null }) === null
)

console.log("\n[5] 문구")
const notice = (kind: DueTrialNotice["kind"], variant: DueTrialNotice["variant"] = null): DueTrialNotice => ({ kind, variant, periodEnd: END })
const messages: Array<[string, string]> = [
  ["30일 전", buildTrialNoticeMessage({ notice: notice("trial_ends_in_30_days", "no_card"), amount: AMOUNT, billingUrl: URL })],
  ["7일 전 · 카드 없음", buildTrialNoticeMessage({ notice: notice("trial_ends_in_7_days", "no_card"), amount: AMOUNT, billingUrl: URL })],
  ["7일 전 · 카드 등록됨", buildTrialNoticeMessage({ notice: notice("trial_ends_in_7_days", "card_registered"), amount: AMOUNT, billingUrl: URL })],
  ["7일 전 · 해지 예약", buildTrialNoticeMessage({ notice: notice("trial_ends_in_7_days", "cancel_scheduled"), amount: AMOUNT, billingUrl: URL })],
  ["1일 전 · 카드 없음", buildTrialNoticeMessage({ notice: notice("trial_ends_in_1_day", "no_card"), amount: AMOUNT, billingUrl: URL })],
  ["1일 전 · 카드 등록됨", buildTrialNoticeMessage({ notice: notice("trial_ends_in_1_day", "card_registered"), amount: AMOUNT, billingUrl: URL })],
  ["1일 전 · 해지 예약", buildTrialNoticeMessage({ notice: notice("trial_ends_in_1_day", "cancel_scheduled"), amount: AMOUNT, billingUrl: URL })],
  ["종료 · 무료 전환", buildTrialNoticeMessage({ notice: notice("trial_ended_free"), amount: AMOUNT, billingUrl: URL })],
  ["종료 · 결제 성공", buildTrialNoticeMessage({ notice: notice("trial_first_charge_succeeded"), amount: AMOUNT, nextChargeAt: "2027-02-20T15:00:00.000Z", billingUrl: URL })],
  ["종료 · 결제 실패", buildTrialNoticeMessage({ notice: notice("trial_first_charge_failed"), amount: AMOUNT, gracePeriodEnd: "2027-01-23T15:00:00.000Z", billingUrl: URL })]
]
const byLabel = new Map(messages)
check(
  "30일 전 문구(요청 문구 그대로 + 요일 · 주소)",
  byLabel.get("30일 전") ===
    `[첫수업] 스탠다드 무료 체험이 1월 20일(수)에 끝나요. 계속 쓰려면 오늘부터 플랜·결제에서 카드를 등록할 수 있어요. 등록하지 않으면 무료 플랜으로 바뀌어요. ${URL}`
)
check("카드 등록됨 7일 전: 'N일에 39,000원이 결제돼요'", byLabel.get("7일 전 · 카드 등록됨")!.includes("1월 20일(수)에 39,000원이 결제돼요"))
check("카드 등록됨 1일 전: '내일 39,000원이 결제돼요'", byLabel.get("1일 전 · 카드 등록됨")!.includes("내일 39,000원이 결제돼요"))
check("결제 성공: 다음 결제일 = 새 기간 끝(2월 21일)", byLabel.get("종료 · 결제 성공")!.includes("다음 결제일은 2월 21일(일)이에요"))
check("결제 실패: 다시 시도한다고 말하고, 유예 끝 전날(1월 23일)을 말한다", byLabel.get("종료 · 결제 실패")!.includes("다시 결제해 볼게요") && byLabel.get("종료 · 결제 실패")!.includes("1월 23일(토)까지 결제되지 않으면"))
check("1일 전: '내일 1월 20일(수)에 끝나요'", byLabel.get("1일 전 · 카드 없음")!.includes("내일 1월 20일(수)에 끝나요"))
check("모든 문구가 [첫수업]으로 시작하고 플랜·결제 주소로 끝난다", messages.every(([, text]) => text.startsWith("[첫수업] ") && text.endsWith(URL)))
check("모든 문구가 해요체다(합니다 · 하십시오 없음)", messages.every(([, text]) => !/니다|십시오/.test(text)))
check("금액은 카탈로그 값(39,000원)이다", AMOUNT === 39000 && messages.filter(([, text]) => text.includes("원")).every(([, text]) => text.includes("39,000원") || !/\d+,\d{3}원/.test(text)))
check("부가세 표기가 없다", messages.every(([, text]) => !text.includes("부가세")))

if (PRINT) {
  console.log("\n── 문구 전체 ──")
  for (const [label, text] of messages) console.log(`• ${label}\n  ${text}`)
}

console.log("\n[6] 작업 소스 계약")
{
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8")
  const job = read("src/features/billing/actions/run-trial-notices.ts")
  const guardAt = job.indexOf("getLocalMutationGuard()")
  check("로컬 가드가 맨 먼저", guardAt > 0 && guardAt < job.indexOf("getSupabaseServiceRoleClient()", guardAt))
  const claimAt = job.indexOf('status: "claimed"')
  check("보내기 전에 claimed 로 자리를 잡는다", claimAt > 0 && claimAt < job.indexOf("await sendSms("))
  check("unique 충돌(23505)은 이미 보낸 것으로 본다", job.includes('claimError.code === "23505"'))
  check("받을 번호가 없으면 skipped", job.includes('status: "skipped", error_message: "recipient_phone_missing"'))
  check("문자 꺼짐은 dry_run 으로 남는다", job.includes('result.status === "dry_run" ? "dry_run"'))
  check("멈춘 claimed 는 1시간 뒤 다시 잡는다", job.includes("STALE_CLAIM_MS = 60 * 60 * 1000"))
  const vercel = JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> }
  const notices = vercel.crons.find((cron) => cron.path === "/api/cron/billing-trial-notices")
  const renewals = vercel.crons.find((cron) => cron.path === "/api/cron/billing-renewals")
  check("크론: 알림 KST 12:30 · 갱신 KST 12:00 (갱신 뒤)", notices?.schedule === "30 3 * * *" && renewals?.schedule === "0 3 * * *")
  const route = read("app/api/cron/billing-trial-notices/route.ts")
  check("크론 route 는 CRON_SECRET 인증을 거친다", route.includes("resolveCronAuthMode(request)"))
}

if (failures > 0) {
  console.error(`FAIL: 체험 알림 검증 실패 ${failures}건`)
  process.exit(1)
}
console.log("\nPASS: 체험 알림 검증 완료")
