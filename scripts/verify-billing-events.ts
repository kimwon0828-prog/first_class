// 결제 이벤트 반영 검증.
//
//   npx supabase start && npx tsx scripts/verify-billing-events.ts
//
// 여기서 고정하는 계약.
//   1. 최초 결제 성공 → 같은 구독 행이 active 로 갱신된다(행을 새로 만들지 않는다).
//   2. 같은 멱등 키는 두 번 반영되지 않는다 — 결제가 두 번 기록되지 않는다.
//   3. 갱신 실패 → past_due + 유예, 유예 안에서만 열린다.
//   4. 해지 예약은 상태를 바꾸지 않고 기간까지 유지한다. 예약 취소도 된다.
//   5. 늦게 도착한 과거 이벤트가 최신 상태를 덮지 않는다.
//   6. 만료 정규화는 접근 판정을 바꾸지 않는다(이미 기간으로 닫혀 있다).
//   7. 결제 금액은 서버 카탈로그 값이다.
//   8. 유예는 이미 결제된 기간을 잘라먹지 않는다 — max(기간 종료, 실패) + 3일.
//   9. 유예는 실패 episode 당 한 번이다. 재시도로 연장되지 않고, 끝난 유예가 다시 열리지 않는다.
//  10. 새 주기가 시작되면 유예가 지워지고, 그 다음 실패에서만 새 유예가 생긴다.
//  11. canceled · expired 는 실패 이벤트로 다시 열리지 않는다 — 구독 상태 mutation 0.
//
// 로컬 Supabase 전용이다.

import { execFile } from "node:child_process"
import { promisify } from "node:util"

import { resolveStudioEntitlements } from "@/features/billing/lib/entitlements"
import {
  BILLING_PLANS,
  addBillingInterval,
  getPurchasableBillingPlan,
  resolveGracePeriodEnd
} from "@/features/billing/lib/plan-catalog"

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

const ORG_A = "b21e0000-0000-4000-8000-000000000001"
const ORG_B = "b21e0000-0000-4000-8000-000000000002"
const ORGS = [ORG_A, ORG_B]

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

const applyEvent = async (args: Record<string, unknown>) => {
  const response = await fetch(`${REST_URL}/rest/v1/rpc/apply_billing_event`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(args)
  })
  const text = await response.text()
  return { ok: response.ok, body: text ? JSON.parse(text) : null }
}

const execFileAsync = promisify(execFile)

/**
 * 로컬 Supabase 의 Postgres 컨테이너.
 *
 * PostgREST 는 요청 하나가 곧 transaction 하나라 lock 을 잡은 채로 둘 수 없다.
 * 동시성 검증([12])만 이 경로로 직접 transaction 을 연다.
 */
const findLocalDbContainer = async (): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync("docker", [
      "ps",
      "--filter",
      "name=supabase_db",
      "--format",
      "{{.Names}}"
    ])
    return stdout.trim().split("\n").filter(Boolean)[0] ?? null
  } catch {
    return null
  }
}

const psql = (container: string, sql: string) =>
  execFileAsync("docker", [
    "exec",
    "-i",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-At",
    "-c",
    sql
  ])

const iso = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString()

const readSubscription = async (organizationId: string) => {
  const rows = (await admin(
    `organization_subscriptions?organization_id=eq.${organizationId}&select=*`
  )) as Array<Record<string, unknown>>
  return rows[0] ?? null
}

const countPayments = async (organizationId: string) =>
  ((await admin(
    `organization_payments?organization_id=eq.${organizationId}&select=id`
  )) as Array<unknown>).length

const teardown = async () => {
  const filter = `in.(${ORGS.join(",")})`
  await admin(`organization_payments?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organization_billing_customers?organization_id=${filter}`, { method: "DELETE" })
  await admin(`billing_webhook_events?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organization_subscriptions?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organizations?id=${filter}`, { method: "DELETE" })
}

const run = async () => {
  await teardown()
  await admin("organizations", {
    method: "POST",
    body: JSON.stringify([
      { id: ORG_A, name: "결제 검증 A", branch_name: "본원" },
      { id: ORG_B, name: "결제 검증 B", branch_name: "본원" }
    ])
  })

  const plan = BILLING_PLANS.standard

  // ───────────────────────────────────────────────────────────
  console.log("\n[1] 서버 canonical 가격")
  {
    const before = failures
    check(plan.amount === 49000, `스탠다드 금액이 다르다: ${plan.amount}`)
    check(plan.currency === "KRW" && plan.interval === "month", "통화·주기가 다르다")
    check(getPurchasableBillingPlan("standard")?.amount === 49000, "판매 플랜 조회가 다르다")
    // pro 는 도메인에만 있고 결제를 만들 수 없다.
    check(getPurchasableBillingPlan("pro") === null, "pro 로 결제를 만들 수 있다")
    check(getPurchasableBillingPlan("free") === null, "존재하지 않는 플랜이 통과했다")
    passLine(before, "스탠다드 49,000원/월 · pro 결제 불가")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[2] PoC trialing → 최초 결제 성공")
  {
    const before = failures
    // 씨큐브처럼 수동 trialing 인 조직에서 시작한다.
    await admin("organization_subscriptions", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_A,
        plan_code: "standard",
        subscription_status: "trialing",
        current_period_start: iso(-5),
        current_period_end: iso(60)
      })
    })

    const paidAt = new Date()
    const result = await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "initial_payment_succeeded",
      p_event_at: paidAt.toISOString(),
      p_idempotency_key: "checkout-a-1",
      p_provider_payment_id: "toss-payment-1",
      p_amount: plan.amount,
      p_period_start: paidAt.toISOString(),
      p_period_end: addBillingInterval(paidAt).toISOString()
    })

    check(result.ok && result.body?.mode === "applied", `반영 실패: ${JSON.stringify(result.body)}`)
    const subscription = await readSubscription(ORG_A)
    check(subscription?.subscription_status === "active", "active 로 바뀌지 않았다")
    check(subscription?.grace_period_end === null, "유예가 남아 있다")
    check(subscription?.cancel_at_period_end === false, "해지 예약이 켜져 있다")

    const rows = (await admin(
      `organization_subscriptions?organization_id=eq.${ORG_A}&select=organization_id`
    )) as Array<unknown>
    check(rows.length === 1, "구독 행이 새로 만들어졌다(조직당 하나여야 한다)")
    check((await countPayments(ORG_A)) === 1, "결제 이력이 1건이 아니다")
    passLine(before, "같은 행이 trialing → active 로 갱신 · 결제 이력 1건")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[3] 같은 멱등 키 재시도")
  {
    const before = failures
    const retry = await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "initial_payment_succeeded",
      p_event_at: iso(0),
      p_idempotency_key: "checkout-a-1",
      p_provider_payment_id: "toss-payment-1",
      p_amount: plan.amount,
      p_period_start: iso(0),
      p_period_end: iso(30)
    })

    check(retry.ok && retry.body?.mode === "duplicate", `duplicate 가 아니다: ${JSON.stringify(retry.body)}`)
    check((await countPayments(ORG_A)) === 1, "재시도로 결제가 두 번 기록됐다")

    // 다른 조직이 같은 키를 쓰면 거절한다.
    const crossOrg = await applyEvent({
      p_organization_id: ORG_B,
      p_event_type: "initial_payment_succeeded",
      p_event_at: iso(0),
      p_idempotency_key: "checkout-a-1",
      p_amount: plan.amount,
      p_period_start: iso(0),
      p_period_end: iso(30)
    })
    check(!crossOrg.ok, "다른 조직이 같은 멱등 키로 결제했다")
    check(
      JSON.stringify(crossOrg.body).includes("billing_idempotency_key_conflict"),
      `기대한 오류가 아니다: ${JSON.stringify(crossOrg.body)}`
    )
    passLine(before, "재시도 → mutation 0 · 다른 조직 키 재사용 거절")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[4] 갱신 실패 → past_due + 3일 유예")
  {
    const before = failures
    const beforeFailure = await readSubscription(ORG_A)
    const periodEnd = String(beforeFailure?.current_period_end)
    const failedAt = new Date()
    // 실패가 이용기간 종료보다 앞선다 — 유예 기준점은 기간 종료여야 한다.
    const expectedGrace = resolveGracePeriodEnd(periodEnd, failedAt)!
    const result = await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "payment_failed",
      p_event_at: failedAt.toISOString(),
      p_idempotency_key: "renewal-a-fail-1",
      p_amount: plan.amount,
      p_failure_code: "CARD_LIMIT_EXCEEDED"
    })

    check(result.ok && result.body?.mode === "applied", "실패 이벤트가 반영되지 않았다")
    const subscription = await readSubscription(ORG_A)
    check(subscription?.subscription_status === "past_due", "past_due 가 아니다")
    check(Boolean(subscription?.grace_period_end), "유예 종료 시각이 없다")

    const storedGrace = new Date(String(subscription?.grace_period_end))
    check(
      Math.abs(storedGrace.getTime() - expectedGrace.getTime()) < 1000,
      `유예가 TS 계산과 다르다: DB ${storedGrace.toISOString()} / TS ${expectedGrace.toISOString()}`
    )
    // 핵심: 이미 결제된 기간보다 먼저 닫히지 않는다.
    check(
      storedGrace.getTime() > new Date(periodEnd).getTime(),
      "유예가 결제된 기간 종료보다 이르다(이미 결제한 기간 침해)"
    )
    check((await countPayments(ORG_A)) === 2, "실패 이력이 남지 않았다")
    passLine(before, "past_due · 유예 = max(기간 종료, 실패) + 3일 · 실패 이력 기록")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[5] 재결제 성공 → active 복귀 · 유예 정리")
  {
    const before = failures
    const paidAt = new Date(Date.now() + 1000)
    await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "renewal_succeeded",
      p_event_at: paidAt.toISOString(),
      p_idempotency_key: "renewal-a-2",
      p_provider_payment_id: "toss-payment-2",
      p_amount: plan.amount,
      p_period_start: paidAt.toISOString(),
      p_period_end: addBillingInterval(paidAt).toISOString()
    })

    const subscription = await readSubscription(ORG_A)
    check(subscription?.subscription_status === "active", "active 로 돌아오지 않았다")
    check(subscription?.grace_period_end === null, "유예가 남아 있다")
    passLine(before, "past_due → active · 유예 해제")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[6] 해지 예약 · 예약 취소")
  {
    const before = failures
    await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "cancel_scheduled",
      p_event_at: new Date(Date.now() + 2000).toISOString()
    })
    let subscription = await readSubscription(ORG_A)
    check(subscription?.cancel_at_period_end === true, "해지 예약이 켜지지 않았다")
    // 해지 예약은 상태를 바꾸지 않는다 — 기간까지 그대로 쓴다.
    check(subscription?.subscription_status === "active", "해지 예약이 상태를 바꿨다")

    await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "cancel_schedule_reverted",
      p_event_at: new Date(Date.now() + 3000).toISOString()
    })
    subscription = await readSubscription(ORG_A)
    check(subscription?.cancel_at_period_end === false, "해지 예약이 취소되지 않았다")
    passLine(before, "예약 시 상태 유지 · 되돌리기 가능")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[7] 늦게 도착한 과거 이벤트")
  {
    const before = failures
    const stale = await applyEvent({
      p_organization_id: ORG_A,
      // 이미 반영한 이벤트들보다 훨씬 과거다.
      p_event_type: "payment_failed",
      p_event_at: iso(-30),
      p_idempotency_key: "renewal-a-stale",
      p_amount: plan.amount
    })

    check(stale.ok && stale.body?.mode === "stale", `stale 로 무시되지 않았다: ${JSON.stringify(stale.body)}`)
    const subscription = await readSubscription(ORG_A)
    check(subscription?.subscription_status === "active", "오래된 실패가 최신 상태를 덮었다")
    // 지금까지 기록된 결제: 최초 성공 · 갱신 실패 · 재결제 성공 = 3건.
    check((await countPayments(ORG_A)) === 3, "무시해야 할 이벤트가 이력에 기록됐다")
    passLine(before, "과거 이벤트 무시 · 상태·이력 불변")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[8] 즉시 해지 · 만료 정규화")
  {
    const before = failures
    await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "immediate_canceled",
      p_event_at: new Date(Date.now() + 4000).toISOString()
    })
    let subscription = await readSubscription(ORG_A)
    check(subscription?.subscription_status === "canceled", "즉시 해지가 반영되지 않았다")

    await applyEvent({
      p_organization_id: ORG_A,
      p_event_type: "period_expired",
      p_event_at: new Date(Date.now() + 5000).toISOString()
    })
    subscription = await readSubscription(ORG_A)
    check(subscription?.subscription_status === "expired", "만료 정규화가 반영되지 않았다")
    check(subscription?.grace_period_end === null, "만료인데 유예가 남아 있다")
    passLine(before, "canceled → expired 정규화")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[9] 구독 없는 조직")
  {
    const before = failures
    const ignored = await applyEvent({
      p_organization_id: ORG_B,
      p_event_type: "period_expired",
      p_event_at: iso(0)
    })
    check(ignored.ok && ignored.body?.mode === "ignored", "구독 없는 만료가 무시되지 않았다")
    check((await readSubscription(ORG_B)) === null, "구독이 없는데 행이 만들어졌다")

    const cancelWithout = await applyEvent({
      p_organization_id: ORG_B,
      p_event_type: "cancel_scheduled",
      p_event_at: iso(0)
    })
    check(!cancelWithout.ok, "구독 없이 해지 예약이 됐다")
    passLine(before, "구독 없으면 상태를 만들지 않는다")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[10] 유예 기준점 — 이미 결제된 기간 보호")
  {
    const before = failures
    const ORG_C = "b21e0000-0000-4000-8000-000000000003"
    await admin("organizations", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: ORG_C, name: "결제 검증 C", branch_name: "본원" })
    })

    const cases = [
      { label: "실패가 기간 종료 전", periodEnd: "2026-10-10T00:00:00.000Z", failedAt: "2026-10-05T00:00:00.000Z", expected: "2026-10-13T00:00:00.000Z" },
      { label: "실패가 기간 종료 당일", periodEnd: "2026-10-10T00:00:00.000Z", failedAt: "2026-10-10T00:00:00.000Z", expected: "2026-10-13T00:00:00.000Z" },
      { label: "실패가 기간 종료 후", periodEnd: "2026-10-10T00:00:00.000Z", failedAt: "2026-10-12T00:00:00.000Z", expected: "2026-10-15T00:00:00.000Z" }
    ]

    for (const [index, item] of cases.entries()) {
      const caseBefore = failures
      await admin(`organization_subscriptions?organization_id=eq.${ORG_C}`, { method: "DELETE" })
      await admin(`organization_payments?organization_id=eq.${ORG_C}`, { method: "DELETE" })
      await admin("organization_subscriptions", {
        method: "POST",
        body: JSON.stringify({
          organization_id: ORG_C,
          plan_code: "standard",
          subscription_status: "active",
          current_period_start: "2026-09-10T00:00:00.000Z",
          current_period_end: item.periodEnd
        })
      })

      const applied = await applyEvent({
        p_organization_id: ORG_C,
        p_event_type: "payment_failed",
        p_event_at: item.failedAt,
        p_idempotency_key: `grace-anchor-${index}`,
        p_amount: plan.amount,
        p_failure_code: "CARD_LIMIT_EXCEEDED"
      })
      check(applied.ok, `${item.label}: 반영 실패 ${JSON.stringify(applied.body)}`)

      const subscription = await readSubscription(ORG_C)
      const storedGrace = String(subscription?.grace_period_end)
      check(
        new Date(storedGrace).toISOString() === item.expected,
        `${item.label}: 유예 기대 ${item.expected} / 실제 ${storedGrace}`
      )
      // TS 재현식도 같은 값을 낸다.
      check(
        resolveGracePeriodEnd(item.periodEnd, new Date(item.failedAt))?.toISOString() === item.expected,
        `${item.label}: TS 계산이 DB 와 다르다`
      )

      // 유예 직전에는 열리고 직후에는 닫힌다.
      const snapshot = {
        subscription: {
          organizationId: ORG_C,
          planCode: "standard" as const,
          status: "past_due" as const,
          currentPeriodStart: "2026-09-10T00:00:00.000Z",
          currentPeriodEnd: item.periodEnd,
          cancelAtPeriodEnd: false,
          gracePeriodEnd: storedGrace
        },
        override: null
      }
      const justBefore = resolveStudioEntitlements(
        snapshot,
        new Date(new Date(item.expected).getTime() - 60 * 1000)
      )
      const justAfter = resolveStudioEntitlements(
        snapshot,
        new Date(new Date(item.expected).getTime() + 60 * 1000)
      )
      check(justBefore.entitlements.canWriteConsultations, `${item.label}: 유예 직전에 닫혔다`)
      check(!justAfter.entitlements.canWriteConsultations, `${item.label}: 유예 이후에도 열려 있다`)

      // 결제된 기간이 끝나기 전에는 절대 닫히지 않는다.
      const atPeriodEnd = resolveStudioEntitlements(
        snapshot,
        new Date(new Date(item.periodEnd).getTime() - 60 * 1000)
      )
      check(
        atPeriodEnd.entitlements.canWriteConsultations,
        `${item.label}: 이미 결제된 기간 안인데 닫혔다`
      )

      passLine(caseBefore, `${item.label.padEnd(18)} → 유예 ${item.expected.slice(0, 10)}`)
    }

    await admin(`organization_payments?organization_id=eq.${ORG_C}`, { method: "DELETE" })
    await admin(`organization_subscriptions?organization_id=eq.${ORG_C}`, { method: "DELETE" })
    await admin(`organizations?id=eq.${ORG_C}`, { method: "DELETE" })
  }


  // ───────────────────────────────────────────────────────────
  console.log("\n[11] 유예는 실패 episode 당 한 번 — 재시도로 연장되지 않는다")
  {
    const before = failures
    const ORG_D = "b21e0000-0000-4000-8000-000000000004"
    const PERIOD_START = "2026-09-10T00:00:00.000Z"
    const PERIOD_END = "2026-10-10T00:00:00.000Z"
    const FIRST_GRACE = "2026-10-13T00:00:00.000Z"

    await admin(`organization_payments?organization_id=eq.${ORG_D}`, { method: "DELETE" })
    await admin(`organization_subscriptions?organization_id=eq.${ORG_D}`, { method: "DELETE" })
    await admin("organizations", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: ORG_D, name: "결제 검증 D", branch_name: "본원" })
    })
    await admin("organization_subscriptions", {
      method: "POST",
      body: JSON.stringify({
        organization_id: ORG_D,
        plan_code: "standard",
        subscription_status: "active",
        current_period_start: PERIOD_START,
        current_period_end: PERIOD_END
      })
    })

    /** 실패 이벤트를 넣고, DB 저장값과 TS 재현식이 같은지까지 확인한다. */
    const failAt = async (label: string, key: string, failedAt: string, expected: string) => {
      const stepBefore = failures
      const previous = await readSubscription(ORG_D)
      const previousGrace = (previous?.grace_period_end as string | null) ?? null
      const periodEnd = (previous?.current_period_end as string | null) ?? null

      const applied = await applyEvent({
        p_organization_id: ORG_D,
        p_event_type: "payment_failed",
        p_event_at: failedAt,
        p_idempotency_key: key,
        p_amount: BILLING_PLANS.standard.amount,
        p_failure_code: "CARD_LIMIT_EXCEEDED"
      })
      check(applied.ok && applied.body?.mode === "applied", `${label}: 반영 실패 ${JSON.stringify(applied.body)}`)

      const subscription = await readSubscription(ORG_D)
      check(subscription?.subscription_status === "past_due", `${label}: past_due 가 아니다`)
      const storedGrace = new Date(String(subscription?.grace_period_end)).toISOString()
      check(storedGrace === expected, `${label}: 유예 기대 ${expected} / 실제 ${storedGrace}`)
      // 기존 유예를 넘긴 TS 재현식이 DB 저장값과 같은지 — 두 구현이 갈리지 않게 고정한다.
      const reproduced = resolveGracePeriodEnd(periodEnd, new Date(failedAt), previousGrace)
      check(
        reproduced?.toISOString() === storedGrace,
        `${label}: TS 계산이 DB 와 다르다 — TS ${reproduced?.toISOString()} / DB ${storedGrace}`
      )
      passLine(stepBefore, `${label.padEnd(26)} → 유예 ${storedGrace.slice(0, 10)}`)
      return storedGrace
    }

    // A. 첫 실패 — 이미 결제된 기간이 끝난 뒤부터 3일.
    await failAt("A 첫 실패 10-10", "episode-d-1", "2026-10-10T00:00:00.000Z", FIRST_GRACE)
    // B·C. 재시도 — 유예를 다시 계산하지 않는다.
    await failAt("B 재시도 10-11", "episode-d-2", "2026-10-11T00:00:00.000Z", FIRST_GRACE)
    await failAt("C 재시도 10-12", "episode-d-3", "2026-10-12T00:00:00.000Z", FIRST_GRACE)

    // D. 유예가 끝난 뒤 도착한 실패 — 유예를 되살리지 않는다.
    {
      const stepBefore = failures
      const snapshotOf = (gracePeriodEnd: string) => ({
        subscription: {
          organizationId: ORG_D,
          planCode: "standard" as const,
          status: "past_due" as const,
          currentPeriodStart: PERIOD_START,
          currentPeriodEnd: PERIOD_END,
          cancelAtPeriodEnd: false,
          gracePeriodEnd
        },
        override: null
      })
      const lateAt = new Date("2026-10-14T00:00:00.000Z")
      // 실패가 오기 전에 이미 닫혀 있다.
      check(
        !resolveStudioEntitlements(snapshotOf(FIRST_GRACE), lateAt).entitlements.canWriteConsultations,
        "D: 유예가 끝났는데 열려 있다"
      )

      const grace = await failAt("D 늦은 실패 10-14", "episode-d-4", lateAt.toISOString(), FIRST_GRACE)
      check(
        !resolveStudioEntitlements(snapshotOf(grace), lateAt).entitlements.canWriteConsultations,
        "D: 늦은 실패 이벤트로 유료 접근이 다시 열렸다"
      )
      passLine(stepBefore, "D 유예 종료 후 실패      → 재오픈 0")
    }

    // E. 갱신 성공 → 새 주기. 그 다음 실패는 새 유예를 만든다.
    {
      const stepBefore = failures
      const NEXT_PERIOD_END = "2026-11-10T00:00:00.000Z"
      const renewal = await applyEvent({
        p_organization_id: ORG_D,
        p_event_type: "renewal_succeeded",
        p_event_at: "2026-10-15T00:00:00.000Z",
        p_idempotency_key: "episode-d-renewal",
        p_provider_payment_id: "toss-payment-d",
        p_amount: BILLING_PLANS.standard.amount,
        p_period_start: PERIOD_END,
        p_period_end: NEXT_PERIOD_END
      })
      check(renewal.ok && renewal.body?.mode === "applied", "E: 갱신이 반영되지 않았다")

      const renewed = await readSubscription(ORG_D)
      check(renewed?.subscription_status === "active", "E: active 로 돌아오지 않았다")
      check(renewed?.grace_period_end === null, "E: 새 주기인데 유예가 남아 있다")
      check(
        new Date(String(renewed?.current_period_end)).toISOString() === NEXT_PERIOD_END,
        "E: 새 이용기간이 저장되지 않았다"
      )
      passLine(stepBefore, "E 갱신 성공 11-10        → 유예 해제")

      await failAt("E 새 주기 실패 11-10", "episode-d-5", NEXT_PERIOD_END, "2026-11-13T00:00:00.000Z")
    }

    await admin(`organization_payments?organization_id=eq.${ORG_D}`, { method: "DELETE" })
    await admin(`organization_subscriptions?organization_id=eq.${ORG_D}`, { method: "DELETE" })
    await admin(`organizations?id=eq.${ORG_D}`, { method: "DELETE" })
    passLine(before, "유예 = episode 당 1회 · 새 주기에서만 새 유예")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[12] 동시 실패 이벤트 — 뒤에 잠근 transaction 이 연장하지 않는다")
  {
    const before = failures
    const ORG_E = "b21e0000-0000-4000-8000-000000000005"
    const container = await findLocalDbContainer()

    check(container !== null, "로컬 Supabase DB 컨테이너를 찾지 못했다 — 동시성 검증을 건너뛸 수 없다")
    if (container) {
      await admin(`organization_payments?organization_id=eq.${ORG_E}`, { method: "DELETE" })
      await admin(`organization_subscriptions?organization_id=eq.${ORG_E}`, { method: "DELETE" })
      await admin("organizations", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify({ id: ORG_E, name: "결제 검증 E", branch_name: "본원" })
      })
      await admin("organization_subscriptions", {
        method: "POST",
        body: JSON.stringify({
          organization_id: ORG_E,
          plan_code: "standard",
          subscription_status: "active",
          current_period_start: "2026-09-10T00:00:00.000Z",
          current_period_end: "2026-10-10T00:00:00.000Z"
        })
      })

      // 1번 transaction 이 구독 행을 잠근 채로 2초 머문다.
      const holding = psql(
        container,
        `select public.apply_billing_event(
           '${ORG_E}'::uuid, 'payment_failed', '2026-10-10T00:00:00+00'::timestamptz,
           'concurrent-e-1', 'toss', null, 'standard', 49000, null, null, 'CARD_LIMIT_EXCEEDED'
         ); select pg_sleep(2);`
      )

      // 그 사이 2번 실패 이벤트가 들어온다. 실패 시각이 더 늦다 —
      // 잠그기 전 snapshot 을 봤다면 유예가 10-17 로 밀린다.
      await new Promise((resolve) => setTimeout(resolve, 500))
      const startedAt = Date.now()
      const second = await applyEvent({
        p_organization_id: ORG_E,
        p_event_type: "payment_failed",
        p_event_at: "2026-10-14T00:00:00.000Z",
        p_idempotency_key: "concurrent-e-2",
        p_amount: BILLING_PLANS.standard.amount,
        p_failure_code: "CARD_LIMIT_EXCEEDED"
      })
      const waitedMs = Date.now() - startedAt
      await holding

      // 실제로 lock 을 기다렸는지 확인한다. 안 기다렸다면 이 검증은 동시성을 보지 못한 것이다.
      check(waitedMs > 800, `2번 이벤트가 lock 을 기다리지 않았다(${waitedMs}ms) — 동시성 검증이 성립하지 않는다`)
      check(second.ok, `2번 이벤트 실패: ${JSON.stringify(second.body)}`)

      const subscription = await readSubscription(ORG_E)
      const storedGrace = new Date(String(subscription?.grace_period_end)).toISOString()
      check(
        storedGrace === "2026-10-13T00:00:00.000Z",
        `동시 실패로 유예가 밀렸다: 기대 2026-10-13 / 실제 ${storedGrace}`
      )
      check(subscription?.subscription_status === "past_due", "past_due 가 아니다")
      // 두 건 다 결제 이력에는 남는다 — 유예만 하나다.
      check((await countPayments(ORG_E)) === 2, "실패 이력 2건이 남지 않았다")

      await admin(`organization_payments?organization_id=eq.${ORG_E}`, { method: "DELETE" })
      await admin(`organization_subscriptions?organization_id=eq.${ORG_E}`, { method: "DELETE" })
      await admin(`organizations?id=eq.${ORG_E}`, { method: "DELETE" })
      passLine(before, `2번 transaction 이 ${waitedMs}ms 대기 후 기존 유예 유지(10-13)`)
    }
  }


  // ───────────────────────────────────────────────────────────
  console.log("\n[13] 종료된 구독은 실패 이벤트로 다시 열리지 않는다")
  {
    const before = failures
    const ORG_F = "b21e0000-0000-4000-8000-000000000006"
    // Marketplace view 는 now() 로 판정한다. 고정 날짜를 쓰면 실제 시계에 따라
    // 재오픈이 우연히 가려질 수 있어, 기준 시각을 지금에 맞춘다.
    const PERIOD_START = iso(-35)
    const PERIOD_END = iso(-5)
    const FAILED_AT = iso(0)

    await admin("organizations", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ id: ORG_F, name: "결제 검증 F", branch_name: "본원" })
    })

    const terminalCases = [
      { label: "expired · payment_failed", status: "expired", eventType: "payment_failed" },
      { label: "expired · billing_method_invalid", status: "expired", eventType: "billing_method_invalid" },
      { label: "canceled · payment_failed", status: "canceled", eventType: "payment_failed" },
      { label: "canceled · billing_method_invalid", status: "canceled", eventType: "billing_method_invalid" }
    ] as const

    for (const [index, item] of terminalCases.entries()) {
      const caseBefore = failures
      await admin(`organization_payments?organization_id=eq.${ORG_F}`, { method: "DELETE" })
      await admin(`organization_subscriptions?organization_id=eq.${ORG_F}`, { method: "DELETE" })
      await admin("organization_subscriptions", {
        method: "POST",
        body: JSON.stringify({
          organization_id: ORG_F,
          plan_code: "standard",
          subscription_status: item.status,
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
          last_billing_event_at: PERIOD_END
        })
      })

      const applied = await applyEvent({
        p_organization_id: ORG_F,
        p_event_type: item.eventType,
        p_event_at: FAILED_AT,
        p_idempotency_key: `terminal-f-${index}`,
        p_amount: BILLING_PLANS.standard.amount,
        p_failure_code: "CARD_LIMIT_EXCEEDED"
      })

      check(applied.ok, `${item.label}: RPC 실패 ${JSON.stringify(applied.body)}`)
      check(
        applied.body?.mode === "ignored" && applied.body?.reason === "subscription_terminal",
        `${item.label}: ignored 가 아니다 — ${JSON.stringify(applied.body)}`
      )

      // 구독 상태 mutation 0.
      const subscription = await readSubscription(ORG_F)
      check(subscription?.subscription_status === item.status, `${item.label}: 상태가 바뀌었다`)
      check(subscription?.grace_period_end === null, `${item.label}: 유예가 생겼다`)
      check(
        new Date(String(subscription?.current_period_end)).toISOString() === PERIOD_END,
        `${item.label}: 이용기간이 바뀌었다`
      )
      check(
        new Date(String(subscription?.last_billing_event_at)).toISOString() === PERIOD_END,
        `${item.label}: last_billing_event_at 이 바뀌었다`
      )

      // Studio 유료 접근 0.
      const entitlements = resolveStudioEntitlements(
        {
          subscription: {
            organizationId: ORG_F,
            planCode: "standard" as const,
            // 기대값이 아니라 DB 에 실제로 남은 값으로 판정한다.
            status: subscription?.subscription_status as typeof item.status,
            currentPeriodStart: PERIOD_START,
            currentPeriodEnd: String(subscription?.current_period_end),
            cancelAtPeriodEnd: false,
            gracePeriodEnd: (subscription?.grace_period_end as string | null) ?? null
          },
          override: null
        },
        new Date()
      )
      check(!entitlements.entitlements.canWriteConsultations, `${item.label}: Studio 유료 접근이 열렸다`)

      // Marketplace 우선 노출 0.
      const boosted = (await admin(
        `marketplace_boosted_organizations?organization_id=eq.${ORG_F}&select=organization_id`
      )) as Array<unknown>
      check(boosted.length === 0, `${item.label}: Marketplace boost 가 열렸다`)

      passLine(caseBefore, `${item.label.padEnd(32)} → ignored · 상태 유지 · 재오픈 0`)
    }

    // 구독이 없는 조직의 실패 이벤트도 상태를 만들지 않는다.
    {
      const caseBefore = failures
      await admin(`organization_payments?organization_id=eq.${ORG_F}`, { method: "DELETE" })
      await admin(`organization_subscriptions?organization_id=eq.${ORG_F}`, { method: "DELETE" })
      const applied = await applyEvent({
        p_organization_id: ORG_F,
        p_event_type: "payment_failed",
        p_event_at: FAILED_AT,
        p_idempotency_key: "terminal-f-missing",
        p_amount: BILLING_PLANS.standard.amount,
        p_failure_code: "CARD_LIMIT_EXCEEDED"
      })
      check(
        applied.ok && applied.body?.mode === "ignored" && applied.body?.reason === "subscription_missing",
        `구독 없는 실패가 ignored 가 아니다 — ${JSON.stringify(applied.body)}`
      )
      check((await readSubscription(ORG_F)) === null, "구독이 없는데 행이 만들어졌다")
      passLine(caseBefore, "구독 없는 실패 이벤트             → ignored · 구독 생성 0")
    }

    await admin(`organization_payments?organization_id=eq.${ORG_F}`, { method: "DELETE" })
    await admin(`organization_subscriptions?organization_id=eq.${ORG_F}`, { method: "DELETE" })
    await admin(`organizations?id=eq.${ORG_F}`, { method: "DELETE" })
    passLine(before, "canceled · expired 는 실패 이벤트로 열리지 않는다")
  }

  await teardown()

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: 결제 이벤트 반영 검증 완료")
}

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await teardown().catch(() => undefined)
  process.exit(1)
})
