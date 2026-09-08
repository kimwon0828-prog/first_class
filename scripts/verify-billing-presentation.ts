// 구독/결제 화면의 표현 계약 검증.
//
//   npx tsx scripts/verify-billing-presentation.ts
//
// DB 없이 돈다. 화면이 상태를 어떻게 말하는지만 고정한다.
//
// 여기서 고정하는 계약.
//   1. DB 상태 문자열을 사용자에게 그대로 보여주지 않는다.
//   2. 결제수단이 없는 구독에 "다음 결제일" 이라고 쓰지 않는다.
//   3. 내부 전체 권한을 "결제 중" 으로 표시하지 않는다.
//   4. 유예는 기간("3일")이 아니라 실제 종료 시각으로 안내한다.
//   5. 판매하지 않는 플랜은 화면 모델에 등장하지 않는다.

import { resolveStudioEntitlements } from "@/features/billing/lib/entitlements"
import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"
import {
  TOSS_CARD_ISSUERS,
  formatBillingAmount,
  formatBillingDate,
  formatBillingDateTime,
  formatPaymentStatus,
  resolveBillingPresentation,
  resolveCardIssuerName,
  USER_VISIBLE_PAYMENT_STATUSES
} from "@/features/billing/lib/subscription-presentation"
import type { OrganizationBillingSnapshot, OrganizationSubscription } from "@/shared/lib/db/adapter"

let failures = 0
const check = (condition: unknown, message: string) => {
  if (condition) {
    return
  }
  failures += 1
  console.error(`  FAIL  ${message}`)
}
const passLine = (before: number, message: string) => {
  if (failures === before) {
    console.log(`  PASS  ${message}`)
  }
}

const ORG = "bb111111-1111-4111-8111-111111111111"
const NOW = new Date("2026-09-09T03:00:00.000Z")
const AMOUNT = BILLING_PLANS.standard.amount

const subscription = (
  overrides: Partial<OrganizationSubscription> = {}
): OrganizationSubscription => ({
  organizationId: ORG,
  planCode: "standard",
  status: "active",
  currentPeriodStart: "2026-09-08T14:31:00.000Z",
  currentPeriodEnd: "2026-10-08T14:31:00.000Z",
  cancelAtPeriodEnd: false,
  gracePeriodEnd: null,
  ...overrides
})

const present = (
  snapshot: OrganizationBillingSnapshot,
  hasActiveBillingMethod: boolean
) =>
  resolveBillingPresentation({
    resolved: resolveStudioEntitlements(snapshot, NOW),
    subscription: snapshot.subscription,
    hasActiveBillingMethod,
    standardAmount: AMOUNT
  })

const RAW_STATUS_STRINGS = ["active", "trialing", "past_due", "canceled", "expired", "free", "standard", "pro"]
/** 화면 문구에 DB 값이 그대로 새어 나오지 않는지 본다. */
const assertNoRawStatus = (label: string, values: Array<string | null | undefined>) => {
  const joined = values.filter(Boolean).join(" ")
  for (const raw of RAW_STATUS_STRINGS) {
    check(!joined.includes(raw), `${label}: DB 값 "${raw}" 이 화면 문구에 노출됐다`)
  }
}

console.log("\n[1] 무료 · 결제 진입 가능 여부")
{
  const before = failures
  // A/B. 무료 상태의 표현은 결제 가능 여부와 무관하다(가능 여부는 화면이 별도로 받는다).
  const free = present({ subscription: null, override: null }, false)
  check(free.planLabel === "무료 플랜", `무료 라벨이 다르다: ${free.planLabel}`)
  check(free.statusBadge.label === "무료" && free.statusBadge.tone === "gray", "무료 배지가 다르다")
  check(free.showStandardOffer, "무료인데 스탠다드 안내가 없다")
  check(free.dateRow === null, "무료인데 날짜를 보여준다")
  check(free.monthlyAmount === null, "무료인데 월 요금을 보여준다")
  check(!free.canCancel && !free.canResume, "무료인데 해지 액션이 있다")
  assertNoRawStatus("무료", [free.planLabel, free.statusBadge.label])
  passLine(before, "A·B 무료 → 무료 플랜 · 스탠다드 안내 노출 · 날짜 없음")
}

console.log("\n[2] 스탠다드 이용 중")
{
  const before = failures
  // C/I. 결제수단이 있으면 다음 결제가 예정된다.
  const active = present({ subscription: subscription(), override: null }, true)
  check(active.planLabel === "스탠다드", `플랜 라벨이 다르다: ${active.planLabel}`)
  check(active.statusBadge.label === "이용 중" && active.statusBadge.tone === "green", "배지가 다르다")
  check(active.monthlyAmount === AMOUNT, "월 요금이 서버 카탈로그 값이 아니다")
  check(active.dateRow?.label === "다음 결제일", `날짜 라벨이 다르다: ${active.dateRow?.label}`)
  check(active.dateRow?.value === "2026년 10월 8일", `날짜가 다르다: ${active.dateRow?.value}`)
  check(active.canCancel, "이용 중인데 해지할 수 없다")
  check(!active.showStandardOffer, "이미 이용 중인데 스탠다드 안내가 뜬다")
  check(active.alert === null, "정상 상태인데 경고가 뜬다")

  // J. 유료인데 결제수단이 없다 — 자동 결제가 없으므로 "다음 결제일" 이라고 쓰지 않는다.
  const noMethod = present({ subscription: subscription(), override: null }, false)
  check(noMethod.dateRow?.label === "이용 종료 예정일", `결제수단 없음 날짜 라벨이 다르다: ${noMethod.dateRow?.label}`)
  check(noMethod.monthlyAmount === null, "청구되지 않는 구독에 월 요금이 표시된다")
  check(noMethod.billingMethodMissing, "결제수단 없음이 표시되지 않는다")
  check(noMethod.alert !== null, "결제수단 없음인데 안내가 없다")
  check(!noMethod.canCancel, "결제수단이 없는데 해지 액션을 노출한다")
  passLine(before, "C·I 이용 중 → 다음 결제일 · J 결제수단 없음 → 종료 예정일 + 안내")
}

console.log("\n[3] 해지 예정")
{
  const before = failures
  // D. 기간까지는 그대로 쓴다. 즉시 무료가 아니다.
  const canceling = present(
    { subscription: subscription({ cancelAtPeriodEnd: true }), override: null },
    true
  )
  check(canceling.statusBadge.label === "해지 예정", `배지가 다르다: ${canceling.statusBadge.label}`)
  check(canceling.statusBadge.tone === "amber", "해지 예정 색이 다르다")
  check(canceling.planLabel === "스탠다드", "해지 예정인데 무료로 표시된다")
  check(canceling.dateRow?.label === "이용 종료 예정일", "해지 예정 날짜 라벨이 다르다")
  check(canceling.dateRow?.value === "2026년 10월 8일", "해지 예정 종료일이 다르다")
  check(canceling.canResume && !canceling.canCancel, "해지 취소 액션이 없다")
  check(
    canceling.alert !== null && canceling.alert.body.includes("2026년 10월 8일"),
    "해지 안내에 실제 종료일이 없다"
  )
  passLine(before, "D 해지 예정 → 종료 예정일 · 해지 취소 가능 · 기능 유지 안내")
}

console.log("\n[4] 결제 확인 필요(past_due)")
{
  const before = failures
  // E. 유예는 "3일" 이 아니라 실제 종료 시각으로 말한다.
  const pastDue = present(
    {
      subscription: subscription({
        status: "past_due",
        gracePeriodEnd: "2026-10-11T14:31:00.000Z"
      }),
      override: null
    },
    true
  )
  check(pastDue.statusBadge.label === "결제 확인 필요", `배지가 다르다: ${pastDue.statusBadge.label}`)
  check(pastDue.alert !== null, "past_due 인데 안내가 없다")
  check(
    pastDue.alert !== null && !pastDue.alert.body.includes("3일"),
    "유예를 기간(3일)으로 하드코딩했다"
  )
  check(
    pastDue.alert !== null && pastDue.alert.body.includes("2026년 10월 11일"),
    "유예 안내에 실제 종료 시각이 없다"
  )
  check(pastDue.dateRow?.label === "이용 종료 예정일", "past_due 에 다음 결제일이라고 쓴다")
  assertNoRawStatus("past_due", [pastDue.statusBadge.label, pastDue.alert?.title, pastDue.alert?.body])
  passLine(before, "E 결제 확인 필요 → 실제 유예 종료 시각 안내")
}

console.log("\n[5] 만료 · 수동 체험 · 내부 권한")
{
  const before = failures
  // F. 기간이 지난 구독은 무료다. 상태 문자열과 무관하게 기간으로 닫힌다.
  const expired = present(
    {
      subscription: subscription({ currentPeriodEnd: "2026-08-08T14:31:00.000Z" }),
      override: null
    },
    true
  )
  check(expired.planLabel === "무료 플랜", "기간이 끝났는데 유료로 표시된다")
  check(expired.showStandardOffer, "만료 후 스탠다드 안내가 다시 뜨지 않는다")

  // G. 씨큐브 PoC — 수동 trialing, 결제수단 없음.
  const poc = present(
    {
      subscription: subscription({
        status: "trialing",
        currentPeriodEnd: "2026-12-31T14:59:59.000Z"
      }),
      override: null
    },
    false
  )
  check(poc.statusBadge.label === "체험 이용 중", `PoC 배지가 다르다: ${poc.statusBadge.label}`)
  check(poc.statusBadge.tone === "blue", "체험 배지 색이 다르다")
  check(poc.dateRow?.label === "이용 종료 예정일", "PoC 에 다음 결제일이라고 거짓 표시한다")
  check(poc.dateRow?.value === "2026년 12월 31일", `PoC 종료일이 다르다: ${poc.dateRow?.value}`)
  check(!poc.canCancel, "자동 결제가 없는 PoC 에 해지 액션을 노출한다")
  // 청구되지 않는 구독에 월 요금을 적으면 청구 중이라고 오해한다.
  check(poc.monthlyAmount === null, "수동 체험에 월 요금이 표시된다")

  // H. 내부 전체 권한 — 결제 사실은 무료다.
  const internal = present(
    {
      subscription: null,
      override: { organizationId: ORG, fullAccess: true, reason: "내부", expiresAt: null }
    },
    false
  )
  check(internal.billedPlanCode === "free", "내부 권한을 결제 사실로 위조했다")
  check(internal.planLabel === "무료 플랜", "내부 권한 조직을 결제 중으로 표시한다")
  check(internal.hasInternalFullAccess, "내부 권한 표시가 없다")
  passLine(before, "F 만료 → 무료 · G PoC → 체험 이용 중 · H 내부 권한 → 결제 사실 무료")
}

console.log("\n[6] 결제 내역 표현")
{
  const before = failures
  // K/L. 사용자 언어로만 말한다.
  check(formatPaymentStatus("succeeded") === "결제 완료", "결제 완료 문구가 다르다")
  check(formatPaymentStatus("failed") === "결제 실패", "결제 실패 문구가 다르다")
  check(formatPaymentStatus("canceled") === "결제 취소", "결제 취소 문구가 다르다")
  check(formatPaymentStatus("refunded") === "환불", "환불 문구가 다르다")
  check(formatPaymentStatus("pending") === "확인 중", "확인 중 문구가 다르다")
  check(formatPaymentStatus("weird_value") === "확인 중", "모르는 상태가 그대로 노출된다")
  for (const status of ["succeeded", "failed", "canceled", "refunded", "pending", "weird_value"]) {
    check(!formatPaymentStatus(status).includes(status), `상태 문구에 DB 값이 남아 있다: ${status}`)
  }
  // 기술적 시도는 목록에 올리지 않는다.
  check(
    !USER_VISIBLE_PAYMENT_STATUSES.includes("pending" as never),
    "pending 시도가 결제 내역에 노출된다"
  )
  check(USER_VISIBLE_PAYMENT_STATUSES.length === 4, "노출 대상 상태 목록이 바뀌었다")
  check(formatBillingAmount(49000) === "49,000원", `금액 표기가 다르다: ${formatBillingAmount(49000)}`)
  passLine(before, "K·L 결제 결과만 · 사용자 문구 · 천 단위 구분")
}

console.log("\n[7] 카드사 · 날짜")
{
  const before = failures
  // 공식 코드만 매핑한다. 모르는 코드는 만들어 내지 않는다.
  check(resolveCardIssuerName("11") === "국민", `11 매핑이 다르다: ${resolveCardIssuerName("11")}`)
  check(resolveCardIssuerName("41") === "신한", "41 매핑이 다르다")
  check(resolveCardIssuerName("51") === "삼성", "51 매핑이 다르다")
  check(resolveCardIssuerName("99") === null, "모르는 코드를 임의로 매핑했다")
  check(resolveCardIssuerName(null) === null, "코드가 없을 때 터진다")
  check(Object.keys(TOSS_CARD_ISSUERS).length >= 20, "카드사 코드표가 비어 있다")

  // KST 로 표기한다. UTC 로 계산하면 자정 근처에서 하루가 밀린다.
  check(formatBillingDate("2026-10-08T14:31:00.000Z") === "2026년 10월 8일", "날짜 표기가 다르다")
  check(formatBillingDate("2026-10-08T15:31:00.000Z") === "2026년 10월 9일", "KST 경계 처리가 다르다")
  check(formatBillingDate(null) === null, "날짜가 없을 때 터진다")
  check(
    formatBillingDateTime("2026-10-11T14:31:00.000Z") === "2026년 10월 11일 오후 11:31",
    `시각 표기가 다르다: ${formatBillingDateTime("2026-10-11T14:31:00.000Z")}`
  )
  // 초 단위가 화면에 보이면 안 된다.
  check(
    !String(formatBillingDateTime("2026-10-11T14:31:59.000Z")).includes("59"),
    "화면 문구에 초가 노출된다"
  )
  passLine(before, "공식 카드사 코드만 매핑 · KST 날짜/시각 · 초 미노출")
}

console.log("\n[8] 판매하지 않는 플랜")
{
  const before = failures
  check(BILLING_PLANS.pro.purchasable === false, "프로가 판매 가능으로 열렸다")
  // 화면 모델에는 프로가 등장할 수 없다 — 결제 사실로만 라벨이 정해진다.
  const free = present({ subscription: null, override: null }, false)
  check(!free.planLabel.includes("프로"), "무료 화면에 프로가 노출된다")
  passLine(before, "프로는 판매하지 않으며 화면 모델에 등장하지 않는다")
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: 구독/결제 표현 계약 검증 완료")
