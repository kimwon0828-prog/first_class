// 공개 Marketplace 우선 노출 자격 검증.
//
//   npx supabase start && npx tsx scripts/verify-marketplace-boost.ts
//
// 여기서 고정하는 계약.
//   1. SQL(marketplace_boosted_organizations)의 판정이 BILLING-2 의
//      resolveStudioEntitlements().hasMarketplaceRankingBoost 와 같다.
//      단 하나의 의도된 예외가 있다 — 내부 전체 권한이다.
//   2. 내부 전체 권한만 있는 조직은 Studio 유료 기능은 열리지만
//      공개 Marketplace 우선 노출은 받지 못한다.
//   3. 결제 상태 해석(trialing/active/canceled/past_due/expired)이 양쪽에서 동일하다.
//
// 로컬 Supabase 전용이다. production 에는 실행하지 않는다.

import { resolveStudioEntitlements } from "@/features/billing/lib/entitlements"
import type {
  OrganizationBillingSnapshot,
  OrganizationSubscriptionStatus
} from "@/shared/lib/db/adapter"

const REST_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321"
const SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

if (!REST_URL.includes("127.0.0.1") && !REST_URL.includes("localhost")) {
  console.error("이 스크립트는 로컬 Supabase 전용이다.")
  process.exit(1)
}

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

const ORG_PREFIX = "b005"
const orgId = (index: number) => `${ORG_PREFIX}0000-0000-4000-8000-00000000000${index}`

const admin = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${REST_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init?.headers ?? {})
    }
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : null
}

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

type Fixture = {
  index: number
  label: string
  subscription: {
    status: OrganizationSubscriptionStatus
    currentPeriodEnd: string | null
  } | null
  override: boolean
  expectBoost: boolean
}

const fixtures: Fixture[] = [
  { index: 1, label: "구독 없음", subscription: null, override: false, expectBoost: false },
  {
    index: 2,
    label: "STANDARD active",
    subscription: { status: "active", currentPeriodEnd: iso(30) },
    override: false,
    expectBoost: true
  },
  {
    index: 3,
    label: "STANDARD trialing",
    subscription: { status: "trialing", currentPeriodEnd: iso(30) },
    override: false,
    expectBoost: true
  },
  {
    index: 4,
    label: "canceled · 기간 남음",
    subscription: { status: "canceled", currentPeriodEnd: iso(10) },
    override: false,
    expectBoost: true
  },
  {
    index: 5,
    label: "canceled · 기간 지남",
    subscription: { status: "canceled", currentPeriodEnd: iso(-10) },
    override: false,
    expectBoost: false
  },
  {
    index: 6,
    label: "past_due · 기간 남음",
    subscription: { status: "past_due", currentPeriodEnd: iso(10) },
    override: false,
    expectBoost: true
  },
  {
    index: 7,
    label: "past_due · 기간 없음",
    subscription: { status: "past_due", currentPeriodEnd: null },
    override: false,
    expectBoost: false
  },
  {
    index: 8,
    label: "expired",
    subscription: { status: "expired", currentPeriodEnd: iso(30) },
    override: false,
    expectBoost: false
  },
  { index: 9, label: "내부 전체 권한만", subscription: null, override: true, expectBoost: false },
  {
    index: 0,
    label: "내부 전체 권한 + STANDARD",
    subscription: { status: "active", currentPeriodEnd: iso(30) },
    override: true,
    expectBoost: true
  }
]

const teardown = async () => {
  const ids = fixtures.map((fixture) => orgId(fixture.index))
  const filter = `in.(${ids.join(",")})`
  await admin(`organization_subscriptions?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organization_entitlement_overrides?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organizations?id=${filter}`, { method: "DELETE" })
}

const run = async () => {
  await teardown()

  await admin("organizations", {
    method: "POST",
    body: JSON.stringify(
      fixtures.map((fixture) => ({
        id: orgId(fixture.index),
        name: `검증 학원 ${fixture.index}`,
        branch_name: "본원"
      }))
    )
  })

  const subscriptionRows = fixtures
    .filter((fixture) => fixture.subscription)
    .map((fixture) => ({
      organization_id: orgId(fixture.index),
      plan_code: "standard",
      subscription_status: fixture.subscription!.status,
      current_period_start: iso(-30),
      current_period_end: fixture.subscription!.currentPeriodEnd
    }))
  if (subscriptionRows.length > 0) {
    await admin("organization_subscriptions", {
      method: "POST",
      body: JSON.stringify(subscriptionRows)
    })
  }

  const overrideRows = fixtures
    .filter((fixture) => fixture.override)
    .map((fixture) => ({
      organization_id: orgId(fixture.index),
      full_access: true,
      reason: "검증용 내부 전체 권한"
    }))
  if (overrideRows.length > 0) {
    await admin("organization_entitlement_overrides", {
      method: "POST",
      body: JSON.stringify(overrideRows)
    })
  }

  const boostedRows = (await admin(
    "marketplace_boosted_organizations?select=organization_id"
  )) as Array<{ organization_id: string }>
  const boosted = new Set(boostedRows.map((row) => row.organization_id))

  // ─────────────────────────────────────────────────────────
  console.log("\n[1] SQL 노출 자격 판정")
  for (const fixture of fixtures) {
    const before = failures
    const actual = boosted.has(orgId(fixture.index))
    check(
      actual === fixture.expectBoost,
      `${fixture.label}: 기대 ${fixture.expectBoost} / 실제 ${actual}`
    )
    passLine(before, `${fixture.label.padEnd(22)} → 우선 노출 ${actual ? "○" : "×"}`)
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[2] BILLING-2 resolver 와의 일치 (내부 전체 권한 제외)")
  for (const fixture of fixtures) {
    const before = failures
    const snapshot: OrganizationBillingSnapshot = {
      subscription: fixture.subscription
        ? {
            organizationId: orgId(fixture.index),
            planCode: "standard",
            status: fixture.subscription.status,
            currentPeriodStart: iso(-30),
            currentPeriodEnd: fixture.subscription.currentPeriodEnd,
            cancelAtPeriodEnd: false
          }
        : null,
      override: fixture.override
        ? {
            organizationId: orgId(fixture.index),
            fullAccess: true,
            reason: "검증용 내부 전체 권한",
            expiresAt: null
          }
        : null
    }

    const { entitlements } = resolveStudioEntitlements(snapshot)
    const studioBoost = entitlements.hasMarketplaceRankingBoost
    const publicBoost = boosted.has(orgId(fixture.index))

    if (fixture.override && !fixture.subscription) {
      // 유일한 의도된 차이. Studio 는 열리고 공개 노출은 열리지 않는다.
      check(studioBoost, `${fixture.label}: Studio entitlement 가 닫혔다`)
      check(!publicBoost, `${fixture.label}: 내부 권한만으로 공개 노출이 열렸다`)
      passLine(before, `${fixture.label.padEnd(22)} → Studio ○ / 공개 × (의도된 분리)`)
      continue
    }

    check(
      studioBoost === publicBoost,
      `${fixture.label}: Studio(${studioBoost}) 와 공개(${publicBoost}) 판정이 다르다`
    )
    passLine(before, `${fixture.label.padEnd(22)} → Studio·공개 판정 일치 (${publicBoost})`)
  }

  // ─────────────────────────────────────────────────────────
  console.log("\n[3] 공개 응답에 결제 상세가 없다")
  {
    const before = failures
    const columns = new Set(Object.keys(boostedRows[0] ?? {}))
    const rankedSample = (await admin(
      "marketplace_ranked_classes?select=*&limit=1"
    )) as Array<Record<string, unknown>>
    const rankedColumns = new Set(Object.keys(rankedSample[0] ?? {}))
    for (const forbidden of [
      "plan_code",
      "subscription_status",
      "current_period_start",
      "current_period_end",
      "full_access",
      "reason"
    ]) {
      check(!columns.has(forbidden), `노출 자격 view 가 ${forbidden} 을 담고 있다`)
      check(!rankedColumns.has(forbidden), `정렬 view 가 ${forbidden} 을 담고 있다`)
    }
    check(rankedColumns.has("boost_eligible"), "정렬 view 에 boost_eligible 이 없다")
    passLine(before, "요금제·기간·override 사유가 공개 경로에 노출되지 않는다")
  }

  await teardown()

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: Marketplace 우선 노출 자격 검증 완료")
}

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await teardown().catch(() => undefined)
  process.exit(1)
})
