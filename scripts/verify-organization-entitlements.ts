// 요금제 · 내부 전체 권한 해석 검증.
//
//   npx tsx scripts/verify-organization-entitlements.ts
//
// 여기서 고정하는 계약.
//   1. 구독 row 가 없으면 FREE 다(무료도 결제 row 가 있어야 하는 구조가 아니다).
//   2. 열람(체험 결과 · 상담 이력)은 어떤 요금제에서도 막히지 않는다 — downgrade 보호.
//   3. 내부 전체 권한은 상업 기능을 전부 열되 결제 사실을 위조하지 않는다.
//   4. override 가 만료되면 즉시 요금제 기준으로 돌아온다.

import {
  resolveStudioEntitlements,
  type StudioEntitlements
} from "@/features/billing/lib/entitlements"
import type { OrganizationBillingSnapshot } from "@/shared/lib/db/adapter"

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

const NOW = new Date("2026-09-10T00:00:00.000Z")
const iso = (offsetDays: number) =>
  new Date(NOW.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

const ORG = "00000000-0000-4000-8000-000000000001"

const snapshot = (
  subscription: OrganizationBillingSnapshot["subscription"],
  override: OrganizationBillingSnapshot["override"] = null
): OrganizationBillingSnapshot => ({ subscription, override })

const standardSubscription = (
  status: OrganizationBillingSnapshot["subscription"] extends infer T
    ? T extends { status: infer S }
      ? S
      : never
    : never,
  currentPeriodEnd: string | null = iso(20)
): OrganizationBillingSnapshot["subscription"] => ({
  organizationId: ORG,
  planCode: "standard",
  status,
  currentPeriodStart: iso(-10),
  currentPeriodEnd,
  cancelAtPeriodEnd: false
})

const fullAccessOverride = (
  expiresAt: string | null
): OrganizationBillingSnapshot["override"] => ({
  organizationId: ORG,
  fullAccess: true,
  reason: "내부 실험 조직",
  expiresAt
})

const STANDARD_KEYS: Array<keyof StudioEntitlements> = [
  "canWriteTrialResults",
  "canWriteConsultations",
  "canReopenConsultation",
  "canUseConversionAnalytics",
  "hasMarketplaceRankingBoost"
]
const FREE_KEYS: Array<keyof StudioEntitlements> = [
  "canListOnMarketplace",
  "canManageAcademyProfile",
  "canManageClasses",
  "canManageSchedule",
  "canManageTeachers",
  "canProcessTrial"
]
const READ_KEYS: Array<keyof StudioEntitlements> = [
  "canViewTrialResults",
  "canViewConsultationHistory"
]
const PRO_KEYS: Array<keyof StudioEntitlements> = [
  "canUseAdvancedAnalytics",
  "canImportConsultations",
  "canUseAiConsultationTools"
]

const all = (entitlements: StudioEntitlements, keys: Array<keyof StudioEntitlements>) =>
  keys.every((key) => entitlements[key])
const none = (entitlements: StudioEntitlements, keys: Array<keyof StudioEntitlements>) =>
  keys.every((key) => !entitlements[key])

// ─────────────────────────────────────────────────────────────
console.log("\n[1] fixture 조직별 해석")

type Fixture = {
  id: string
  label: string
  input: OrganizationBillingSnapshot
  expectPaid: boolean
  expectPro: boolean
  expectBilledPlan: "free" | "standard" | "pro"
  expectInternal: boolean
}

const fixtures: Fixture[] = [
  {
    id: "A",
    label: "구독 없음 · override 없음",
    input: snapshot(null),
    expectPaid: false,
    expectPro: false,
    expectBilledPlan: "free",
    expectInternal: false
  },
  {
    id: "B",
    label: "STANDARD active",
    input: snapshot(standardSubscription("active")),
    expectPaid: true,
    expectPro: false,
    expectBilledPlan: "standard",
    expectInternal: false
  },
  {
    id: "C",
    label: "구독 없음 · 내부 전체 권한",
    input: snapshot(null, fullAccessOverride(null)),
    expectPaid: true,
    expectPro: true,
    expectBilledPlan: "free",
    expectInternal: true
  },
  {
    id: "D",
    label: "STANDARD · 만료된 override",
    input: snapshot(standardSubscription("active"), fullAccessOverride(iso(-1))),
    expectPaid: true,
    expectPro: false,
    expectBilledPlan: "standard",
    expectInternal: false
  },
  {
    id: "E",
    label: "구독 없음 · 만료된 override",
    input: snapshot(null, fullAccessOverride(iso(-1))),
    expectPaid: false,
    expectPro: false,
    expectBilledPlan: "free",
    expectInternal: false
  }
]

for (const fixture of fixtures) {
  const before = failures
  const { entitlements, billedPlanCode, hasInternalFullAccess } = resolveStudioEntitlements(
    fixture.input,
    NOW
  )

  check(
    billedPlanCode === fixture.expectBilledPlan,
    `${fixture.id} 결제 사실: 기대 ${fixture.expectBilledPlan} / 실제 ${billedPlanCode}`
  )
  check(
    hasInternalFullAccess === fixture.expectInternal,
    `${fixture.id} 내부 전체 권한 판정이 기대와 다르다`
  )
  check(all(entitlements, FREE_KEYS), `${fixture.id} 무료 기능이 닫혔다`)
  check(all(entitlements, READ_KEYS), `${fixture.id} 기존 데이터 열람이 막혔다`)
  check(
    fixture.expectPaid ? all(entitlements, STANDARD_KEYS) : none(entitlements, STANDARD_KEYS),
    `${fixture.id} 유료 기능 판정이 기대(${fixture.expectPaid})와 다르다`
  )
  check(
    fixture.expectPro ? all(entitlements, PRO_KEYS) : none(entitlements, PRO_KEYS),
    `${fixture.id} PRO 기능 판정이 기대(${fixture.expectPro})와 다르다`
  )

  passLine(
    before,
    `${fixture.id}  ${fixture.label.padEnd(24)} → 결제 ${billedPlanCode}${
      hasInternalFullAccess ? " + 내부 전체 권한" : ""
    } / 유료기능 ${fixture.expectPaid ? "열림" : "닫힘"}`
  )
}

// ─────────────────────────────────────────────────────────────
console.log("\n[2] 구독 상태별 유료 기능")

const statusCases: Array<{
  label: string
  input: OrganizationBillingSnapshot
  expectPaid: boolean
}> = [
  { label: "trialing", input: snapshot(standardSubscription("trialing")), expectPaid: true },
  { label: "active", input: snapshot(standardSubscription("active")), expectPaid: true },
  {
    label: "canceled · 기간 남음",
    input: snapshot(standardSubscription("canceled", iso(5))),
    expectPaid: true
  },
  {
    label: "canceled · 기간 지남",
    input: snapshot(standardSubscription("canceled", iso(-5))),
    expectPaid: false
  },
  {
    label: "past_due · 기간 남음",
    input: snapshot(standardSubscription("past_due", iso(5))),
    expectPaid: true
  },
  {
    label: "past_due · 기간 없음",
    input: snapshot(standardSubscription("past_due", null)),
    expectPaid: false
  },
  { label: "expired", input: snapshot(standardSubscription("expired", iso(5))), expectPaid: false }
]

for (const item of statusCases) {
  const before = failures
  const { entitlements } = resolveStudioEntitlements(item.input, NOW)
  check(
    item.expectPaid ? all(entitlements, STANDARD_KEYS) : none(entitlements, STANDARD_KEYS),
    `${item.label}: 유료 기능 판정이 기대(${item.expectPaid})와 다르다`
  )
  // 어떤 상태에서도 무료 운영과 기존 데이터 열람은 막히지 않는다.
  check(all(entitlements, FREE_KEYS), `${item.label}: 무료 기능이 닫혔다`)
  check(all(entitlements, READ_KEYS), `${item.label}: 열람이 막혔다`)
  passLine(before, `${item.label.padEnd(20)} → 유료기능 ${item.expectPaid ? "열림" : "닫힘"}`)
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] 내부 전체 권한은 결제를 위조하지 않는다")
{
  const before = failures
  const { entitlements, billedPlanCode, hasInternalFullAccess } = resolveStudioEntitlements(
    snapshot(null, fullAccessOverride(null)),
    NOW
  )
  check(billedPlanCode === "free", "override 가 결제 사실을 standard/pro 로 바꿨다")
  check(hasInternalFullAccess, "override 가 반영되지 않았다")
  check(
    all(entitlements, [...FREE_KEYS, ...READ_KEYS, ...STANDARD_KEYS, ...PRO_KEYS]),
    "내부 전체 권한인데 열리지 않은 기능이 있다"
  )
  passLine(before, "결제 사실 free 를 유지한 채 상업 기능만 전부 열린다")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[4] full_access=false override 는 아무 효과가 없다")
{
  const before = failures
  const { entitlements, hasInternalFullAccess } = resolveStudioEntitlements(
    snapshot(null, {
      organizationId: ORG,
      fullAccess: false,
      reason: "비활성 기록",
      expiresAt: null
    }),
    NOW
  )
  check(!hasInternalFullAccess, "full_access=false 인데 내부 권한으로 판정됐다")
  check(none(entitlements, STANDARD_KEYS), "full_access=false 인데 유료 기능이 열렸다")
  passLine(before, "full_access=false → FREE 그대로")
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: 요금제 · 내부 전체 권한 해석 검증 완료")
