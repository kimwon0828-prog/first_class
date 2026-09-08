// 구독 lifecycle 진리표 검증.
//
//   npx supabase start && npx tsx scripts/verify-billing-lifecycle.ts
//
// 여기서 고정하는 계약.
//   1. 유료 접근은 결제 기간으로 닫힌다 — 상태 갱신이 늦거나 실패해도 새지 않는다.
//   2. TS resolver(resolveStudioEntitlements)와 SQL(organization_has_paid_access)의
//      판정이 모든 경우에 같다. 갈리면 Studio 는 무료인데 Marketplace 는 우선 노출된다.
//   3. Marketplace view 도 같은 판정을 쓴다.
//   4. 내부 전체 권한은 Studio 만 열고 공개 우선 노출은 열지 않는다(의도된 유일한 차이).
//   5. 씨큐브 PoC 형태(manual trialing)가 기간 안에서는 열리고 기간 후에는 닫힌다.
//
// 로컬 Supabase 전용이다.

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

const ORG_PREFIX = "b117"
const orgId = (index: number) => `${ORG_PREFIX}0000-0000-4000-8000-${String(index).padStart(12, "0")}`

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

type Row = {
  index: number
  label: string
  status: OrganizationSubscriptionStatus | null
  currentPeriodEnd?: string | null
  gracePeriodEnd?: string | null
  cancelAtPeriodEnd?: boolean
  override?: boolean
  /** 결제 기준 유료 접근(Studio 유료 기능 · Marketplace boost 공통). */
  expectPaid: boolean
  /** Studio 상업 기능 전체. 내부 전체 권한이면 결제와 무관하게 열린다. */
  expectStudioPaid: boolean
}

const TRUTH_TABLE: Row[] = [
  { index: 1, label: "구독 없음", status: null, expectPaid: false, expectStudioPaid: false },
  {
    index: 2,
    label: "trialing · 기간 내",
    status: "trialing",
    currentPeriodEnd: iso(30),
    expectPaid: true,
    expectStudioPaid: true
  },
  {
    index: 3,
    label: "trialing · 기간 종료",
    status: "trialing",
    currentPeriodEnd: iso(-1),
    expectPaid: false,
    expectStudioPaid: false
  },
  {
    index: 4,
    label: "active · 기간 내",
    status: "active",
    currentPeriodEnd: iso(20),
    expectPaid: true,
    expectStudioPaid: true
  },
  {
    index: 5,
    label: "active · 기간 종료",
    status: "active",
    currentPeriodEnd: iso(-1),
    expectPaid: false,
    expectStudioPaid: false
  },
  {
    index: 6,
    label: "active · 해지 예약 · 기간 내",
    status: "active",
    currentPeriodEnd: iso(10),
    cancelAtPeriodEnd: true,
    expectPaid: true,
    expectStudioPaid: true
  },
  {
    index: 7,
    label: "past_due · 유예 내",
    status: "past_due",
    currentPeriodEnd: iso(-1),
    gracePeriodEnd: iso(2),
    expectPaid: true,
    expectStudioPaid: true
  },
  {
    index: 8,
    label: "past_due · 유예 종료",
    status: "past_due",
    currentPeriodEnd: iso(-5),
    gracePeriodEnd: iso(-2),
    expectPaid: false,
    expectStudioPaid: false
  },
  {
    index: 9,
    label: "canceled(즉시 종료)",
    status: "canceled",
    currentPeriodEnd: iso(10),
    expectPaid: false,
    expectStudioPaid: false
  },
  {
    index: 0,
    label: "expired",
    status: "expired",
    currentPeriodEnd: iso(10),
    expectPaid: false,
    expectStudioPaid: false
  },
  {
    index: 11,
    label: "내부 전체 권한 · 구독 없음",
    status: null,
    override: true,
    expectPaid: false,
    expectStudioPaid: true
  },
  {
    index: 12,
    label: "내부 전체 권한 · 기간 종료 구독",
    status: "active",
    currentPeriodEnd: iso(-1),
    override: true,
    expectPaid: false,
    expectStudioPaid: true
  }
]

const toSnapshot = (row: Row): OrganizationBillingSnapshot => ({
  subscription: row.status
    ? {
        organizationId: orgId(row.index),
        planCode: "standard",
        status: row.status,
        currentPeriodStart: iso(-30),
        currentPeriodEnd: row.currentPeriodEnd ?? null,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd ?? false,
        gracePeriodEnd: row.gracePeriodEnd ?? null
      }
    : null,
  override: row.override
    ? {
        organizationId: orgId(row.index),
        fullAccess: true,
        reason: "검증용 내부 전체 권한",
        expiresAt: null
      }
    : null
})

const teardown = async () => {
  const ids = TRUTH_TABLE.map((row) => orgId(row.index))
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
      TRUTH_TABLE.map((row) => ({
        id: orgId(row.index),
        name: `lifecycle ${row.index}`,
        branch_name: "본원"
      }))
    )
  })

  const subscriptionRows = TRUTH_TABLE.filter((row) => row.status).map((row) => ({
    organization_id: orgId(row.index),
    plan_code: "standard",
    subscription_status: row.status,
    current_period_start: iso(-30),
    current_period_end: row.currentPeriodEnd ?? null,
    cancel_at_period_end: row.cancelAtPeriodEnd ?? false,
    grace_period_end: row.gracePeriodEnd ?? null
  }))
  await admin("organization_subscriptions", {
    method: "POST",
    body: JSON.stringify(subscriptionRows)
  })

  const overrideRows = TRUTH_TABLE.filter((row) => row.override).map((row) => ({
    organization_id: orgId(row.index),
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
  const boosted = new Set(boostedRows.map((item) => item.organization_id))

  const sqlAccessRows = (await admin(
    `organization_subscriptions?select=organization_id,subscription_status,current_period_end,grace_period_end&organization_id=in.(${TRUTH_TABLE.map(
      (row) => orgId(row.index)
    ).join(",")})`
  )) as Array<Record<string, string | null>>

  // ───────────────────────────────────────────────────────────
  console.log("\n[1] 유료 접근 진리표 (TS resolver)")
  for (const row of TRUTH_TABLE) {
    const before = failures
    const { entitlements, billedPlanCode, hasInternalFullAccess } = resolveStudioEntitlements(
      toSnapshot(row)
    )

    check(
      entitlements.canWriteConsultations === row.expectStudioPaid,
      `${row.label}: Studio 유료 기능 기대 ${row.expectStudioPaid} / 실제 ${entitlements.canWriteConsultations}`
    )
    check(
      entitlements.hasMarketplaceRankingBoost === row.expectStudioPaid,
      `${row.label}: Studio boost flag 가 다른 유료 flag 와 다르다`
    )
    // 결제 사실은 override 로 위조되지 않는다.
    check(
      (billedPlanCode === "standard") === row.expectPaid,
      `${row.label}: 결제 사실 기대 ${row.expectPaid ? "standard" : "free"} / 실제 ${billedPlanCode}`
    )
    check(
      hasInternalFullAccess === Boolean(row.override),
      `${row.label}: 내부 전체 권한 판정이 다르다`
    )
    // 무료 운영과 기존 데이터 열람은 어떤 경우에도 닫히지 않는다.
    check(entitlements.canProcessTrial, `${row.label}: 무료 체험 운영이 막혔다`)
    check(entitlements.canViewConsultationHistory, `${row.label}: 기존 상담 열람이 막혔다`)
    passLine(
      before,
      `${row.label.padEnd(26)} → 결제 ${row.expectPaid ? "유효" : "없음"} · Studio 유료 ${
        row.expectStudioPaid ? "열림" : "닫힘"
      }`
    )
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[2] SQL 판정이 TS 와 같다")
  for (const row of TRUTH_TABLE) {
    const before = failures
    const stored = sqlAccessRows.find((item) => item.organization_id === orgId(row.index))

    if (!row.status) {
      check(!stored, `${row.label}: 구독이 없어야 하는데 row 가 있다`)
      check(!boosted.has(orgId(row.index)), `${row.label}: 구독 없이 우선 노출이 열렸다`)
      passLine(before, `${row.label.padEnd(26)} → SQL 우선 노출 ×`)
      continue
    }

    const sqlAccess = (await admin(
      `rpc/organization_has_paid_access`,
      {
        method: "POST",
        body: JSON.stringify({
          p_status: stored!.subscription_status,
          p_current_period_end: stored!.current_period_end,
          p_grace_period_end: stored!.grace_period_end
        })
      }
    )) as boolean

    check(
      sqlAccess === row.expectPaid,
      `${row.label}: SQL 판정 기대 ${row.expectPaid} / 실제 ${sqlAccess}`
    )
    // 내부 전체 권한은 공개 우선 노출을 열지 않는다(의도된 유일한 차이).
    check(
      boosted.has(orgId(row.index)) === row.expectPaid,
      `${row.label}: Marketplace 우선 노출이 결제 판정과 다르다`
    )
    passLine(
      before,
      `${row.label.padEnd(26)} → SQL ${sqlAccess ? "열림" : "닫힘"} · 우선 노출 ${
        row.expectPaid ? "○" : "×"
      }`
    )
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[3] 씨큐브 PoC 형태 (manual trialing)")
  {
    const before = failures
    const pocSubscription = {
      organizationId: "poc",
      planCode: "standard" as const,
      status: "trialing" as const,
      currentPeriodStart: "2026-09-04T17:21:40.000Z",
      currentPeriodEnd: "2026-12-31T14:59:59.000Z",
      cancelAtPeriodEnd: false,
      gracePeriodEnd: null
    }

    const inside = resolveStudioEntitlements(
      { subscription: pocSubscription, override: null },
      new Date("2026-09-05T00:00:00.000Z")
    )
    const after = resolveStudioEntitlements(
      { subscription: pocSubscription, override: null },
      new Date("2027-01-01T00:00:00.000Z")
    )

    check(inside.entitlements.canWriteConsultations, "PoC 기간 안인데 Standard 가 닫혔다")
    check(inside.entitlements.hasMarketplaceRankingBoost, "PoC 기간 안인데 우선 노출이 닫혔다")
    // DB status 가 아직 trialing 이어도 기간이 지나면 닫힌다.
    check(!after.entitlements.canWriteConsultations, "기간이 지났는데 Standard 가 열려 있다")
    check(!after.entitlements.hasMarketplaceRankingBoost, "기간이 지났는데 우선 노출이 열려 있다")
    check(after.entitlements.canProcessTrial, "만료 후 무료 운영까지 막혔다")
    check(after.entitlements.canViewTrialResults, "만료 후 기존 체험 결과 열람이 막혔다")
    passLine(before, "2026-09-05 열림 · 2027-01-01 닫힘 (상태 갱신과 무관)")
  }

  await teardown()

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: 구독 lifecycle 진리표 검증 완료")
}

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await teardown().catch(() => undefined)
  process.exit(1)
})
