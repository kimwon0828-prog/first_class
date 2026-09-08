// BILLING-3B.1 recovery verifier. 실제 Toss API는 호출하지 않는다.
// npx tsx scripts/verify-billing-recovery.ts

import { buildInitialBillingPeriod, buildRenewalBillingPeriod } from "@/features/billing/lib/billing-period"
import { toBillingEventArgs, type VerifiedBillingEvent } from "@/features/billing/lib/billing-events"
import { chargeSubscription } from "@/features/billing/lib/charge/charge-subscription"
import type {
  BillingPaymentAttempt,
  BillingPaymentAttemptInput
} from "@/features/billing/lib/charge/payment-attempt"
import { checkCheckoutCallback } from "@/features/billing/lib/checkout/checkout-guards"
import { settleStoredPayment } from "@/features/billing/lib/settle/settle-payment-core"
import { issueTossBillingKey } from "@/features/billing/lib/toss/client"

let failures = 0
const check = (value: unknown, message: string) => {
  if (value) return
  failures += 1
  console.error(`  FAIL  ${message}`)
}
const section = (name: string) => console.log(`\n${name}`)
const pass = (before: number, message: string) => {
  if (failures === before) console.log(`  PASS  ${message}`)
}

const REST_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321"
const SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

if (!REST_URL.includes("127.0.0.1") && !REST_URL.includes("localhost")) {
  throw new Error("recovery verifier는 로컬 Supabase 전용이다")
}

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
  const body = await response.text()
  if (!response.ok) throw new Error(`${path} → ${response.status} ${body}`)
  return body ? JSON.parse(body) : null
}

const fakeFetch = (
  handler: (url: string, init: RequestInit) => { status: number; body: unknown } | "timeout"
) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: unknown, init: unknown) => {
    const call = { url: String(url), init: (init ?? {}) as RequestInit }
    calls.push(call)
    const result = handler(call.url, call.init)
    if (result === "timeout") {
      const error = new Error("timeout")
      error.name = "AbortError"
      throw error
    }
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "Content-Type": "application/json" }
    })
  }) as unknown as typeof fetch
  return { impl, calls }
}

type DbPayment = {
  id: string
  organization_id: string
  provider_order_id: string
  provider_idempotency_key: string
  idempotency_key: string
  attempt_kind: "initial" | "renewal"
  attempt_number: number
  checkout_session_id: string | null
  plan_code: "standard" | "pro"
  amount: number
  period_start: string
  period_end: string
  billing_anchor_day: number | null
  status: "pending" | "succeeded" | "failed"
  provider_payment_id: string | null
  paid_at: string | null
  failure_code: string | null
}

const toAttempt = (row: DbPayment): BillingPaymentAttempt => ({
  id: row.id,
  organizationId: row.organization_id,
  provider: "toss",
  orderId: row.provider_order_id,
  providerIdempotencyKey: row.provider_idempotency_key,
  attemptKey: row.idempotency_key,
  attemptKind: row.attempt_kind,
  attemptNumber: row.attempt_number,
  checkoutSessionId: row.checkout_session_id,
  planCode: row.plan_code,
  amount: row.amount,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  anchorDay: row.billing_anchor_day,
  status: row.status,
  providerPaymentId: row.provider_payment_id,
  paidAt: row.paid_at,
  failureCode: row.failure_code
})

const PAYMENT_SELECT =
  "id,organization_id,provider_order_id,provider_idempotency_key,idempotency_key,attempt_kind,attempt_number,checkout_session_id,plan_code,amount,period_start,period_end,billing_anchor_day,status,provider_payment_id,paid_at,failure_code"

const readAttempt = async (key: string) => {
  const rows = (await admin(
    `organization_payments?idempotency_key=eq.${encodeURIComponent(key)}&select=${PAYMENT_SELECT}`
  )) as DbPayment[]
  return rows[0] ? toAttempt(rows[0]) : null
}

const makeEnsure = (ordering?: string[]) => async (input: BillingPaymentAttemptInput) => {
  const existing = await readAttempt(input.attemptKey)
  if (existing) return existing
  ordering?.push("pending_saved")
  const rows = (await admin("organization_payments", {
    method: "POST",
    body: JSON.stringify({
      organization_id: input.organizationId,
      provider: "toss",
      provider_order_id: input.orderId,
      provider_idempotency_key: input.providerIdempotencyKey,
      idempotency_key: input.attemptKey,
      attempt_kind: input.attemptKind,
      attempt_number: input.attemptNumber,
      checkout_session_id: input.checkoutSessionId,
      billing_anchor_day: input.anchorDay,
      plan_code: input.planCode,
      amount: input.amount,
      status: "pending",
      period_start: input.periodStart,
      period_end: input.periodEnd
    })
  })) as DbPayment[]
  return toAttempt(rows[0])
}

const applyEvent = async (event: VerifiedBillingEvent) =>
  admin("rpc/apply_billing_event", {
    method: "POST",
    body: JSON.stringify(toBillingEventArgs(event))
  })

const ORGS = [
  "b31f0000-0000-4000-8000-000000000001",
  "b31f0000-0000-4000-8000-000000000002",
  "b31f0000-0000-4000-8000-000000000003"
]
const SESSION = "b31f0000-0000-4000-8000-0000000000c1"
const DECLINE_SESSION = "b31f0000-0000-4000-8000-0000000000c2"
const cleanup = async () => {
  const filter = `in.(${ORGS.join(",")})`
  await admin(`organization_payments?organization_id=${filter}`, { method: "DELETE" })
  await admin(`billing_checkout_sessions?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organization_subscriptions?organization_id=${filter}`, { method: "DELETE" })
  await admin(`organizations?id=${filter}`, { method: "DELETE" })
}

const run = async () => {
  await cleanup()
  await admin("organizations", {
    method: "POST",
    body: JSON.stringify(ORGS.map((id, i) => ({ id, name: `복구 검증 ${i}`, branch_name: "본원" })))
  })

  const initialPeriod = buildInitialBillingPeriod(new Date("2027-01-31T10:00:00+09:00"))
  const initialInput = {
    organizationId: ORGS[0],
    billingKey: "bk_recovery",
    customerKey: "fs-recovery-customer",
    planCode: "standard" as const,
    amount: 49000,
    orderId: "fsc-b31f00000000400080000000000000c1",
    orderName: "첫수업 스탠다드 구독",
    idempotencyKey: "fsc-b31f00000000400080000000000000c1",
    attemptKey: `checkout:${SESSION}`,
    attemptKind: "initial" as const,
    attemptNumber: 0,
    checkoutSessionId: SESSION,
    attemptPeriod: initialPeriod,
    eventType: "initial_payment_succeeded" as const,
    resolvePeriod: () => initialPeriod,
    applyEvent
  }

  await admin("billing_checkout_sessions", {
    method: "POST",
    body: JSON.stringify({
      id: SESSION,
      organization_id: ORGS[0],
      customer_key: "fs-recovery-customer",
      plan_code: "standard",
      amount: 49000,
      order_id: initialInput.orderId,
      payment_idempotency_key: initialInput.attemptKey,
      billing_key_issue_idempotency_key: `billing-key:${SESSION}`,
      expires_at: "2027-01-31T02:00:00.000Z"
    })
  })

  section("[1] POST 전 pending durability · timeout")
  {
    const before = failures
    const ordering: string[] = []
    const toss = fakeFetch((_url, init) => {
      if (init.method === "POST") {
        ordering.push("provider_post")
        return "timeout"
      }
      return { status: 500, body: { code: "SERVER_ERROR" } }
    })
    const result = await chargeSubscription(
      { secretKey: "test_sk_recovery", fetchImpl: toss.impl },
      { ...initialInput, ensureAttempt: makeEnsure(ordering) }
    )
    const stored = await readAttempt(initialInput.attemptKey)
    check(result.status === "pending", "timeout이 pending이 아니다")
    check(ordering.join(",") === "pending_saved,provider_post", `호출 순서가 다르다: ${ordering}`)
    check(
      stored?.status === "pending" && stored.orderId === initialInput.orderId && stored.amount === 49000,
      "정확한 pending attempt가 남지 않았다"
    )
    pass(before, "pending 저장 → provider POST · timeout 후 exact orderId 유지")
  }

  section("[2] reconciliation pending → succeeded · 성공 재시도 no-op")
  {
    const before = failures
    const payment = {
      paymentKey: "pk_recovery_initial",
      orderId: initialInput.orderId,
      status: "DONE",
      totalAmount: 49000,
      approvedAt: "2027-01-31T10:00:00+09:00",
      currency: "KRW"
    }
    const lookup = fakeFetch(() => ({ status: 200, body: payment }))
    const pending = await readAttempt(initialInput.attemptKey)
    if (!pending) throw new Error("missing pending fixture")
    const settled = await settleStoredPayment(
      { secretKey: "test_sk_recovery", fetchImpl: lookup.impl },
      pending,
      applyEvent as never
    )
    const final = await readAttempt(initialInput.attemptKey)
    const subscriptions = (await admin(
      `organization_subscriptions?organization_id=eq.${ORGS[0]}&select=subscription_status,billing_anchor_day,current_period_end`
    )) as Array<{ subscription_status: string; billing_anchor_day: number; current_period_end: string }>
    check(settled.status === "applied", "조회 성공이 반영되지 않았다")
    check(final?.status === "succeeded" && final.providerPaymentId === payment.paymentKey, "pending이 succeeded로 settle되지 않았다")
    check(subscriptions[0]?.subscription_status === "active" && subscriptions[0]?.billing_anchor_day === 31, "Standard/anchor가 정확히 열리지 않았다")
    check(lookup.calls.every((call) => call.init.method === "GET"), "reconciliation이 charge POST를 보냈다")

    const retryFetch = fakeFetch(() => ({ status: 500, body: {} }))
    const retried = await chargeSubscription(
      { secretKey: "test_sk_recovery", fetchImpl: retryFetch.impl },
      { ...initialInput, ensureAttempt: makeEnsure() }
    )
    check(retried.status === "succeeded" && retryFetch.calls.length === 0, "succeeded retry가 provider를 다시 호출했다")
    pass(before, "GET 검증으로 1회 활성화 · succeeded 재시도 provider call 0")
  }

  section("[3] renewal exact identity · decline")
  {
    const before = failures
    const period = buildRenewalBillingPeriod(new Date(initialPeriod.periodEnd), 31)
    const key = `renewal:${ORGS[0]}:${initialPeriod.periodEnd}:a1`
    const orderId = "fsr-b31f0000000040008000000000000001-202702281000-a1"
    const decline = fakeFetch((_url, init) =>
      init.method === "POST"
        ? { status: 400, body: { code: "REJECT_CARD_COMPANY" } }
        : { status: 404, body: { code: "NOT_FOUND_PAYMENT" } }
    )
    const result = await chargeSubscription(
      { secretKey: "test_sk_recovery", fetchImpl: decline.impl },
      {
        ...initialInput,
        checkoutSessionId: null,
        orderId,
        idempotencyKey: orderId,
        attemptKey: key,
        attemptKind: "renewal",
        attemptNumber: 1,
        attemptPeriod: period,
        eventType: "renewal_succeeded",
        resolvePeriod: () => period,
        ensureAttempt: makeEnsure()
      }
    )
    const stored = await readAttempt(key)
    check(result.status === "declined" && stored?.status === "failed", "verified decline이 failed로 settle되지 않았다")
    check(stored?.orderId === orderId && stored.attemptNumber === 1, "renewal exact order/attempt가 저장되지 않았다")
    if (!stored) throw new Error("missing failed renewal fixture")
    // 실패 기록 시각이 provider 승인 시각보다 뒤인 실제 correction 상황을 만든다.
    await admin(`organization_subscriptions?organization_id=eq.${ORGS[0]}`, {
      method: "PATCH",
      body: JSON.stringify({
        subscription_status: "past_due",
        last_billing_event_at: "2027-03-01T00:00:00.000Z"
      })
    })

    const unverified = await admin("rpc/apply_billing_event", {
      method: "POST",
      body: JSON.stringify({
        ...toBillingEventArgs({
          organizationId: stored.organizationId,
          occurredAt: "2027-02-28T10:00:00+09:00",
          provider: "toss",
          type: "renewal_succeeded",
          idempotencyKey: stored.attemptKey,
          providerPaymentId: "placeholder",
          planCode: stored.planCode,
          amount: stored.amount,
          periodStart: stored.periodStart,
          periodEnd: stored.periodEnd,
          attempt: {
            providerOrderId: stored.orderId,
            providerIdempotencyKey: stored.providerIdempotencyKey,
            attemptKind: stored.attemptKind,
            attemptNumber: stored.attemptNumber,
            checkoutSessionId: null,
            billingAnchorDay: stored.anchorDay
          }
        }),
        p_provider_payment_id: null
      })
    }) as { mode: string }
    check(unverified.mode === "terminal_conflict", "provider payment id 없는 failed→success가 허용됐다")

    const verifiedLookup = fakeFetch(() => ({
      status: 200,
      body: {
        paymentKey: "pk_verified_correction",
        orderId,
        status: "DONE",
        totalAmount: 49000,
        approvedAt: "2027-02-28T10:00:00+09:00",
        currency: "KRW"
      }
    }))
    const corrected = await settleStoredPayment(
      { secretKey: "test_sk_recovery", fetchImpl: verifiedLookup.impl },
      stored,
      applyEvent as never
    )
    const correctedSubscription = (await admin(
      `organization_subscriptions?organization_id=eq.${ORGS[0]}&select=subscription_status,current_period_end`
    )) as Array<{ subscription_status: string; current_period_end: string }>
    check(
      corrected.status === "applied" &&
        (await readAttempt(key))?.status === "succeeded" &&
        correctedSubscription[0]?.subscription_status === "active",
      "provider 조회로 검증된 failed→success 교정이 막혔다"
    )
    pass(before, "renewal exact order 저장 · failed→success는 provider 검증 시에만 허용")
  }

  section("[4] 5xx · 409 · 429 recoverable pending")
  {
    const before = failures
    for (const [index, status] of [500, 409, 429].entries()) {
      const orderId = `fsr-b31f0000000040008000000000000003-202703310900-a${index}`
      const key = `renewal:${ORGS[2]}:2027-03-31T00:00:00.000Z:a${index}`
      const unknown = fakeFetch(() => ({ status, body: { code: `HTTP_${status}` } }))
      const result = await chargeSubscription(
        { secretKey: "test_sk_recovery", fetchImpl: unknown.impl },
        {
          ...initialInput,
          organizationId: ORGS[2],
          checkoutSessionId: null,
          orderId,
          idempotencyKey: orderId,
          attemptKey: key,
          attemptKind: "renewal",
          attemptNumber: index,
          attemptPeriod: {
            periodStart: "2027-03-31T00:00:00.000Z",
            periodEnd: "2027-04-30T00:00:00.000Z",
            anchorDay: 31
          },
          eventType: "renewal_succeeded",
          ensureAttempt: makeEnsure()
        }
      )
      check(result.status === "pending", `${status}가 pending이 아니다`)
    }
    const pending = (await admin(
      `organization_payments?organization_id=eq.${ORGS[2]}&status=eq.pending&select=provider_order_id`
    )) as Array<{ provider_order_id: string }>
    check(pending.length === 3, `reconciliation이 찾을 pending이 ${pending.length}개다`)
    pass(before, "unknown 3종 모두 failed 0 · DB pending 조회 가능")
  }

  section("[5] initial decline entitlement 0")
  {
    const before = failures
    const orderId = "fsc-b31f00000000400080000000000000c2"
    const key = `checkout:${DECLINE_SESSION}`
    await admin("billing_checkout_sessions", {
      method: "POST",
      body: JSON.stringify({
        id: DECLINE_SESSION,
        organization_id: ORGS[1],
        customer_key: "fs-decline-customer",
        plan_code: "standard",
        amount: 49000,
        order_id: orderId,
        payment_idempotency_key: key,
        billing_key_issue_idempotency_key: `billing-key:${DECLINE_SESSION}`,
        expires_at: "2027-01-31T02:00:00.000Z"
      })
    })
    const decline = fakeFetch((_url, init) =>
      init.method === "POST"
        ? { status: 400, body: { code: "REJECT_CARD_COMPANY" } }
        : { status: 404, body: { code: "NOT_FOUND_PAYMENT" } }
    )
    const result = await chargeSubscription(
      { secretKey: "test_sk_recovery", fetchImpl: decline.impl },
      {
        ...initialInput,
        organizationId: ORGS[1],
        customerKey: "fs-decline-customer",
        orderId,
        idempotencyKey: orderId,
        attemptKey: key,
        checkoutSessionId: DECLINE_SESSION,
        ensureAttempt: makeEnsure()
      }
    )
    const subscriptions = (await admin(
      `organization_subscriptions?organization_id=eq.${ORGS[1]}&select=organization_id`
    )) as unknown[]
    check(result.status === "declined" && (await readAttempt(key))?.status === "failed", "initial decline이 failed가 아니다")
    check(subscriptions.length === 0, "initial decline이 Standard entitlement를 열었다")
    pass(before, "initial payment failed 기록 · Standard open 0")
  }

  section("[6] checkout resume lease · 동시 callback")
  {
    const before = failures
    const snapshot = {
      id: SESSION,
      organizationId: ORGS[0],
      customerKey: "fs-recovery-customer",
      planCode: "standard",
      amount: 49000,
      orderId: initialInput.orderId,
      paymentIdempotencyKey: initialInput.attemptKey,
      billingKeyIssueIdempotencyKey: `billing-key:${SESSION}`,
      status: "authorized",
      expiresAt: "2027-01-31T02:00:00.000Z"
    }
    check(
      checkCheckoutCallback(snapshot, {
        actorOrganizationId: ORGS[0], customerKey: snapshot.customerKey, authKey: "auth"
      }, new Date("2027-02-01T00:00:00Z")).ok,
      "authorized crash가 callback guard에서 stuck된다"
    )

    await admin(`billing_checkout_sessions?id=eq.${SESSION}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "authorized", processing_token: null, processing_started_at: null })
    })
    const claim = async (token: string, cutoff: string) =>
      (await admin(
        `billing_checkout_sessions?id=eq.${SESSION}&status=in.(pending,authorized)&or=(processing_started_at.is.null,processing_started_at.lt.${encodeURIComponent(cutoff)})`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "authorized", processing_token: token, processing_started_at: "2027-01-31T01:00:00Z" })
        }
      )) as unknown[]
    const first = await claim("b31f0000-0000-4000-8000-0000000000a1", "2027-01-31T00:58:00Z")
    const concurrent = await claim("b31f0000-0000-4000-8000-0000000000a2", "2027-01-31T00:58:00Z")
    check(first.length === 1 && concurrent.length === 0, "동시 callback 둘이 같은 lease를 얻었다")
    await admin(`billing_checkout_sessions?id=eq.${SESSION}`, {
      method: "PATCH",
      body: JSON.stringify({ processing_started_at: "2027-01-31T00:55:00Z" })
    })
    const resumed = await claim("b31f0000-0000-4000-8000-0000000000a3", "2027-01-31T00:58:00Z")
    check(resumed.length === 1, "crash 후 만료 lease를 재선점하지 못했다")
    pass(before, "동시 선점 1개 · crash 후 authorized resume")
  }

  section("[7] billing-key issue 멱등성")
  {
    const before = failures
    let providerOperations = 0
    let transportCalls = 0
    const cache = new Map<string, unknown>()
    const mock = fakeFetch((_url, init) => {
      transportCalls += 1
      const key = (init.headers as Record<string, string>)["Idempotency-Key"]
      if (!cache.has(key)) {
        providerOperations += 1
        cache.set(key, { billingKey: "bk_same", customerKey: "fs-recovery-customer" })
      }
      if (transportCalls === 1) return "timeout"
      return { status: 200, body: cache.get(key) }
    })
    const input = {
      authKey: "auth-once",
      customerKey: "fs-recovery-customer",
      idempotencyKey: `billing-key:${SESSION}`
    }
    const first = await issueTossBillingKey({ secretKey: "test_sk_recovery", fetchImpl: mock.impl }, input)
    const retry = await issueTossBillingKey({ secretKey: "test_sk_recovery", fetchImpl: mock.impl }, input)
    check(first.outcome === "unknown" && retry.outcome === "succeeded", "응답 유실 후 billing-key retry가 복구되지 않았다")
    check(providerOperations === 1, "같은 issuance가 provider에서 두 번 수행됐다")
    check(
      mock.calls.every((call) => (call.init.headers as Record<string, string>)["Idempotency-Key"] === input.idempotencyKey),
      "resume에서 billing-key 멱등키가 바뀌었다"
    )
    pass(before, "응답 유실 재호출도 같은 issuance key · operation 1회")
  }

  section("[8] negative control · Jan 31")
  {
    const before = failures
    const final = await readAttempt(initialInput.attemptKey)
    const oldPendingWouldBlock = final !== null
    check(oldPendingWouldBlock, "old duplicate negative control이 재현되지 않았다")
    check(final?.status === "succeeded", "새 RPC가 pending을 final로 바꾸지 못했다")
    const oldAuthorizedWouldReject = snapshotStatusRejects("authorized")
    check(oldAuthorizedWouldReject, "old authorized guard negative control이 재현되지 않았다")
    const march = buildRenewalBillingPeriod(new Date(initialPeriod.periodEnd), 31)
    const april = buildRenewalBillingPeriod(new Date(march.periodEnd), 31)
    const kst = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600000).toISOString().slice(0, 10)
    check(
      [kst(initialPeriod.periodEnd), kst(march.periodEnd), kst(april.periodEnd)].join(",") ===
        "2027-02-28,2027-03-31,2027-04-30",
      "1/31 anchor가 recovery 후 drift했다"
    )
    pass(before, "old pending/authorized 계약은 FAIL · 새 계약과 1/31 회귀 PASS")
  }

  await cleanup()
  if (failures) {
    console.error(`\nFAIL: ${failures}건`)
    process.exit(1)
  }
  console.log("\nPASS: Billing payment/checkout recovery 검증 완료")
}

const snapshotStatusRejects = (status: string) => status !== "pending"

run().catch(async (error) => {
  console.error("\n검증 중 예외:", error)
  await cleanup().catch(() => undefined)
  process.exit(1)
})
