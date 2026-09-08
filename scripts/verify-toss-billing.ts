// Toss 자동결제 연동 계약 검증.
//
//   npx tsx scripts/verify-toss-billing.ts
//
// 실제 Toss API 를 부르지 않는다. 가짜 fetch 로 응답을 만들어
// 우리 쪽 판정(성공/실패/불명, 금액 검증, 식별자, 기간 계산)만 고정한다.
//
// 여기서 고정하는 계약.
//   1. 자동결제는 API 개별 연동 키(ck/sk)만 쓴다. 위젯 키·환경 혼용·live 는 거부한다.
//   2. customerKey 는 조직 id 가 아니라 난수다.
//   3. 같은 논리 결제 시도는 항상 같은 orderId·멱등키를 만든다.
//   4. timeout·5xx·409 는 실패가 아니라 "불명" 이다.
//   5. 금액·주문번호가 다르면 결제를 반영하지 않는다.
//   6. 월 기준일은 밀리지 않는다(1/31 → 2/28 → 3/31).
//   7. 결제창 callback 은 저장해 둔 의도와 맞을 때만 진행한다(cross-org·재생 차단).
//   8. 결제 결과를 모르면 원장에 쓰지 않는다.
//   9. 자동 갱신 대상은 구독+빌링키뿐이다. PoC·내부 override·해지 예약은 결제하지 않는다.
//  10. webhook body 로는 아무것도 바꾸지 않는다. 같은 이벤트는 한 번만 기록된다.

import { chargeSubscription } from "@/features/billing/lib/charge/charge-subscription"
import { checkCheckoutCallback } from "@/features/billing/lib/checkout/checkout-guards"
import { decideRenewal } from "@/features/billing/lib/renewal/renewal-schedule"
import {
  chargeTossBillingKey,
  getTossPaymentByOrderId,
  issueTossBillingKey
} from "@/features/billing/lib/toss/client"
import { generateTossCustomerKey, isValidTossCustomerKey } from "@/features/billing/lib/toss/customer-key"
import {
  buildInitialBillingAttempt,
  buildRenewalBillingAttempt,
  decodeBillingOrderId,
  expandBillingInstant
} from "@/features/billing/lib/toss/identifiers"
import {
  HANDLED_WEBHOOK_EVENTS,
  parseTossWebhook
} from "@/features/billing/lib/webhook/webhook-contract"
import { buildTossBasicAuthHeader, checkTossKeyPair } from "@/features/billing/lib/toss/keys"
import { verifyTossPayment } from "@/features/billing/lib/toss/verify-payment"
import {
  addBillingMonths,
  buildInitialBillingPeriod,
  buildRenewalBillingPeriod,
  resolveBillingAnchorDay
} from "@/features/billing/lib/billing-period"
import { BILLING_PLANS } from "@/features/billing/lib/plan-catalog"

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

// [11] 만 로컬 Supabase 를 쓴다. 나머지는 네트워크 없이 돈다.
const REST_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321"
const SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"
const ANON_KEY =
  process.env.SUPABASE_LOCAL_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"

if (!REST_URL.includes("127.0.0.1") && !REST_URL.includes("localhost")) {
  console.error("이 스크립트의 DB 검증 구간은 로컬 Supabase 전용이다.")
  process.exit(1)
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
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${text}`)
  }
  return text ? JSON.parse(text) : null
}

const SECRET = "test_sk_verifyverifyverify1234"
const CLIENT = "test_ck_verifyverifyverify1234"

/** 응답을 지정해 주는 가짜 fetch. 실제 네트워크로 나가지 않는다. */
const mockFetch = (
  handler: (url: string, init: RequestInit) => { status: number; body: unknown } | "timeout"
) => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const impl = (async (url: unknown, init: unknown) => {
    const request = { url: String(url), init: (init ?? {}) as RequestInit }
    calls.push(request)
    const result = handler(request.url, request.init)
    if (result === "timeout") {
      const error = new Error("aborted")
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

const run = async () => {
  const plan = BILLING_PLANS.standard

  // ───────────────────────────────────────────────────────────
  console.log("\n[1] 연동 키 규칙")
  {
    const before = failures
    check(checkTossKeyPair(CLIENT, SECRET).ok, "정상 test 키 쌍이 거부됐다")
    check(
      !checkTossKeyPair("test_gck_aaaa", "test_gsk_bbbb").ok,
      "결제위젯 키(gck/gsk)가 자동결제 키로 통과했다"
    )
    check(!checkTossKeyPair(SECRET, CLIENT).ok, "client/secret 이 뒤바뀐 쌍이 통과했다")
    check(!checkTossKeyPair("test_ck_aaaa", "live_sk_bbbb").ok, "test/live 혼용이 통과했다")
    check(!checkTossKeyPair("live_ck_aaaa", "live_sk_bbbb").ok, "live 키가 기본값으로 통과했다")
    check(
      checkTossKeyPair("live_ck_aaaa", "live_sk_bbbb", { allowLive: true }).ok,
      "명시 허용에서도 live 키가 막혔다"
    )
    check(!checkTossKeyPair("", SECRET).ok, "빈 client key 가 통과했다")
    passLine(before, "개별 연동 키만 허용 · 위젯/혼용/역할바뀜/live 거부")
  }

  console.log("\n[2] Basic 인증 헤더")
  {
    const before = failures
    const header = buildTossBasicAuthHeader(SECRET)
    const decoded = Buffer.from(header.replace("Basic ", ""), "base64").toString("utf8")
    check(decoded === `${SECRET}:`, `콜론이 빠졌다: ${decoded.endsWith(":")}`)
    passLine(before, "base64(`secretKey:`) — 콜론 포함")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[3] customerKey")
  {
    const before = failures
    const organizationId = "8cd6f7e4-fd75-48db-9b11-c7dfe43ef421"
    const first = generateTossCustomerKey()
    const second = generateTossCustomerKey()

    check(isValidTossCustomerKey(first), `형식이 어긋난다: ${first}`)
    check(first !== second, "customerKey 가 매번 같다")
    check(!first.includes(organizationId), "customerKey 에 조직 id 가 들어갔다")
    check(!isValidTossCustomerKey(organizationId), "조직 UUID 가 customerKey 로 통과했다")
    check(first.length <= 50 && first.length >= 2, `길이 제약을 벗어났다: ${first.length}`)
    passLine(before, "난수 opaque key · 조직 id 재사용 금지")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[4] 결제 시도 식별자")
  {
    const before = failures
    const sessionId = "3f2b1a44-0000-4000-8000-000000000abc"
    const a = buildInitialBillingAttempt(sessionId)
    const b = buildInitialBillingAttempt(sessionId)
    check(a.orderId === b.orderId && a.attemptKey === b.attemptKey, "최초 결제 키가 재현되지 않는다")

    const org = "8cd6f7e4-fd75-48db-9b11-c7dfe43ef421"
    const periodEnd = "2026-10-10T00:00:00.000Z"
    const r1 = buildRenewalBillingAttempt(org, periodEnd)
    const r2 = buildRenewalBillingAttempt(org, periodEnd)
    check(r1.orderId === r2.orderId, "같은 기간 갱신 키가 달라졌다 — Cron 중복 실행이 두 번 결제한다")
    check(r1.attemptKey === `renewal:${org}:${periodEnd}:a0`, `원장 키 형식이 다르다: ${r1.attemptKey}`)

    const retry = buildRenewalBillingAttempt(org, periodEnd, 1)
    check(retry.orderId !== r1.orderId, "유예 중 재시도가 최초 시도와 같은 주문번호를 쓴다")

    const nextPeriod = buildRenewalBillingAttempt(org, "2026-11-10T00:00:00.000Z")
    check(nextPeriod.orderId !== r1.orderId, "다른 기간이 같은 주문번호를 쓴다")

    for (const attempt of [a, r1, retry, nextPeriod]) {
      check(/^[A-Za-z0-9_-]{6,64}$/.test(attempt.orderId), `orderId 제약 위반: ${attempt.orderId}`)
      check(attempt.idempotencyKey.length <= 300, "멱등키가 300자를 넘는다")
    }
    passLine(before, "같은 시도 = 같은 키 · 재시도/다음 기간 = 다른 키")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[5] 호출 결과 분류 — 실패와 불명을 구분한다")
  {
    const before = failures
    const charge = (handler: Parameters<typeof mockFetch>[0]) =>
      chargeTossBillingKey(
        { secretKey: SECRET, fetchImpl: mockFetch(handler).impl },
        {
          billingKey: "bk_test",
          customerKey: "fs-00000000000000000000000000000000",
          amount: plan.amount,
          orderId: "fsc-abc123",
          orderName: "첫수업 스탠다드 구독",
          idempotencyKey: "fsc-abc123"
        }
      )

    check((await charge(() => "timeout")).outcome === "unknown", "timeout 이 실패로 분류됐다")
    check(
      (await charge(() => ({ status: 500, body: { code: "SERVER_ERROR" } }))).outcome === "unknown",
      "5xx 가 실패로 분류됐다"
    )
    check(
      (await charge(() => ({ status: 409, body: { code: "IDEMPOTENT_REQUEST_PROCESSING" } })))
        .outcome === "unknown",
      "409 처리중이 실패로 분류됐다"
    )
    check(
      (await charge(() => ({ status: 429, body: { code: "TOO_MANY_REQUESTS" } }))).outcome ===
        "unknown",
      "429 가 실패로 분류됐다"
    )
    const declined = await charge(() => ({
      status: 400,
      body: { code: "REJECT_CARD_COMPANY", message: "한도 초과" }
    }))
    check(declined.outcome === "failed", "카드사 거절이 확정 실패로 분류되지 않았다")
    check(declined.outcome === "failed" && declined.code === "REJECT_CARD_COMPANY", "실패 코드가 유실됐다")
    passLine(before, "timeout·5xx·409·429 = 불명 / 4xx 거절 = 확정 실패")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[6] 요청 형태")
  {
    const before = failures
    const issue = mockFetch(() => ({ status: 200, body: { billingKey: "bk", customerKey: "fs-x" } }))
    await issueTossBillingKey(
      { secretKey: SECRET, fetchImpl: issue.impl },
      { authKey: "auth_123", customerKey: "fs-x", idempotencyKey: "fsc-abc123" }
    )
    const issued = issue.calls[0]
    check(
      issued.url.endsWith("/v1/billing/authorizations/issue"),
      `빌링키 발급 endpoint 가 다르다: ${issued.url}`
    )
    check(
      JSON.parse(String(issued.init.body)).authKey === "auth_123",
      "authKey 가 본문에 담기지 않았다"
    )
    check(
      (issued.init.headers as Record<string, string>)["Idempotency-Key"] === "fsc-abc123",
      "멱등키 헤더가 빠졌다"
    )

    const chargeMock = mockFetch(() => ({ status: 200, body: {} }))
    await chargeTossBillingKey(
      { secretKey: SECRET, fetchImpl: chargeMock.impl },
      {
        billingKey: "bk_live_1",
        customerKey: "fs-x",
        amount: plan.amount,
        orderId: "fsc-abc123",
        orderName: "첫수업 스탠다드 구독",
        idempotencyKey: "fsc-abc123"
      }
    )
    const charged = chargeMock.calls[0]
    check(charged.url.endsWith("/v1/billing/bk_live_1"), `승인 endpoint 가 다르다: ${charged.url}`)
    const chargeBody = JSON.parse(String(charged.init.body))
    check(chargeBody.amount === 49000, "서버 카탈로그 금액이 전달되지 않았다")
    check(
      chargeBody.customerKey && chargeBody.orderId && chargeBody.orderName,
      "필수 필드가 빠졌다"
    )

    const lookup = mockFetch(() => ({ status: 200, body: {} }))
    await getTossPaymentByOrderId({ secretKey: SECRET, fetchImpl: lookup.impl }, "fsc-abc123")
    check(
      lookup.calls[0].url.endsWith("/v1/payments/orders/fsc-abc123"),
      `조회 endpoint 가 다르다: ${lookup.calls[0].url}`
    )
    passLine(before, "발급·승인·조회 endpoint 와 본문이 공식 계약과 같다")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[7] 결제 검증")
  {
    const before = failures
    const base = {
      paymentKey: "pk_1",
      orderId: "fsc-abc123",
      status: "DONE" as const,
      totalAmount: 49000,
      approvedAt: "2026-09-08T01:00:00+09:00",
      currency: "KRW"
    }
    const expectation = { orderId: "fsc-abc123", amount: plan.amount }

    check(verifyTossPayment(base, expectation).verdict === "verified", "정상 결제가 거부됐다")

    // G. 금액 불일치
    const amountMismatch = verifyTossPayment({ ...base, totalAmount: 1000 }, expectation)
    check(amountMismatch.verdict === "mismatch", "금액이 달라도 통과했다")
    check(
      amountMismatch.verdict === "mismatch" && amountMismatch.code === "amount_mismatch",
      "금액 불일치 코드가 다르다"
    )

    check(
      verifyTossPayment({ ...base, orderId: "fsc-other" }, expectation).verdict === "mismatch",
      "다른 주문의 결제가 통과했다"
    )
    check(
      verifyTossPayment({ ...base, status: "IN_PROGRESS" }, expectation).verdict === "pending",
      "진행 중 결제가 확정 처리됐다"
    )
    check(
      verifyTossPayment({ ...base, status: "ABORTED" }, expectation).verdict === "failed",
      "중단된 결제가 실패로 분류되지 않았다"
    )
    check(
      verifyTossPayment({ ...base, approvedAt: null }, expectation).verdict === "pending",
      "승인 시각 없는 DONE 이 확정됐다"
    )
    check(verifyTossPayment(null, expectation).verdict === "mismatch", "빈 결제 객체가 통과했다")
    passLine(before, "DONE + 주문번호 + 서버 금액 일치일 때만 verified")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[8] 월 기준일 — 밀리지 않는다")
  {
    const before = failures
    // T. 1/31 결제. KST 기준으로 앵커는 31일이다.
    const firstPaidAt = new Date("2027-01-31T10:00:00+09:00")
    const initial = buildInitialBillingPeriod(firstPaidAt)
    check(initial.anchorDay === 31, `기준일이 31이 아니다: ${initial.anchorDay}`)

    const kstDate = (value: string) =>
      new Date(new Date(value).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const chain: string[] = [initial.periodEnd]
    let cursor = initial
    for (let index = 0; index < 4; index += 1) {
      cursor = buildRenewalBillingPeriod(new Date(cursor.periodEnd), initial.anchorDay)
      chain.push(cursor.periodEnd)
    }

    const expected = ["2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31", "2027-06-30"]
    const actual = chain.map(kstDate)
    check(
      JSON.stringify(actual) === JSON.stringify(expected),
      `기준일이 밀렸다: ${actual.join(" → ")}`
    )

    // 윤년
    check(
      kstDate(addBillingMonths(new Date("2028-01-31T10:00:00+09:00"), 31).toISOString()) ===
        "2028-02-29",
      "윤년 2월 29일 처리가 다르다"
    )
    // 30일 고정 계산이 아니다.
    const febEnd = addBillingMonths(new Date("2027-01-31T10:00:00+09:00"), 31)
    check(
      febEnd.getTime() - new Date("2027-01-31T10:00:00+09:00").getTime() !== 30 * 86400000,
      "단순 30일 더하기가 됐다"
    )
    // KST 자정 근처: UTC 로 계산하면 하루가 밀린다.
    check(
      resolveBillingAnchorDay(new Date("2027-03-01T00:30:00+09:00")) === 1,
      "KST 자정 직후 결제의 기준일이 밀렸다"
    )
    // 앵커를 모르면 직전 종료일을 기준으로 삼고, 그 뒤로는 고정된다.
    const recovered = buildRenewalBillingPeriod(new Date("2027-02-28T10:00:00+09:00"), null)
    check(recovered.anchorDay === 28, `앵커 복구가 다르다: ${recovered.anchorDay}`)
    passLine(before, `1/31 → ${actual.join(" → ")}`)
  }


  // ───────────────────────────────────────────────────────────
  console.log("\n[9] 결제창 callback 검증")
  {
    const before = failures
    const ORG_A = "8cd6f7e4-fd75-48db-9b11-c7dfe43ef421"
    const ORG_B = "5f279736-afbc-4be4-bb54-b42435f2c789"
    const session = {
      id: "3f2b1a44-0000-4000-8000-000000000abc",
      organizationId: ORG_A,
      customerKey: "fs-00000000000000000000000000000001",
      planCode: "standard",
      amount: 49000,
      orderId: "fsc-3f2b1a4400004000800000000000abc",
      paymentIdempotencyKey: "checkout:3f2b1a44-0000-4000-8000-000000000abc",
      status: "pending",
      expiresAt: "2026-09-08T12:00:00.000Z"
    }
    const now = new Date("2026-09-08T11:00:00.000Z")
    const callback = { actorOrganizationId: ORG_A, customerKey: session.customerKey, authKey: "auth_1" }

    // A. 정상 진입
    check(checkCheckoutCallback(session, callback, now).ok, "정상 callback 이 거부됐다")

    // B. 다른 조직이 남의 callback 을 재생
    const crossOrg = checkCheckoutCallback(session, { ...callback, actorOrganizationId: ORG_B }, now)
    check(!crossOrg.ok, "다른 조직의 callback 이 통과했다")
    check(
      !crossOrg.ok && crossOrg.code === "organization_mismatch",
      "cross-org 거부 코드가 다르다"
    )
    check(
      !crossOrg.ok && crossOrg.message === "결제 요청을 찾을 수 없습니다. 처음부터 다시 시도해 주세요.",
      "cross-org 응답이 존재 여부를 알려 준다"
    )

    // C. 같은 callback 재생
    const replay = checkCheckoutCallback({ ...session, status: "authorized" }, callback, now)
    check(!replay.ok && replay.code === "already_processed", "이미 처리된 callback 이 통과했다")
    check(
      !checkCheckoutCallback({ ...session, status: "completed" }, callback, now).ok,
      "완료된 세션이 다시 통과했다"
    )

    check(!checkCheckoutCallback(null, callback, now).ok, "세션 없는 callback 이 통과했다")
    check(
      !checkCheckoutCallback(session, { ...callback, authKey: "" }, now).ok,
      "authKey 없는 callback 이 통과했다"
    )
    check(
      !checkCheckoutCallback(session, callback, new Date("2026-09-08T12:00:01.000Z")).ok,
      "만료된 세션이 통과했다"
    )
    passLine(before, "조직 불일치·재생·만료·누락 전부 차단")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[10] 결제 실행 분기")
  {
    const before = failures
    const ORG = "8cd6f7e4-fd75-48db-9b11-c7dfe43ef421"
    const ORDER_ID = "fsr-8cd6f7e4fd7548db9b11c7dfe43ef421-202610100000-a0"
    const ATTEMPT_KEY = `renewal:${ORG}:2026-10-10T00:00:00.000Z:a0`

    /** apply_billing_event 를 흉내 낸다 — 같은 멱등 키는 두 번 반영되지 않는다. */
    const createLedger = () => {
      const applied: Array<{ type: string; key: string }> = []
      const apply = async (event: {
        type: string
        idempotencyKey?: string
        [key: string]: unknown
      }) => {
        const key = String(event.idempotencyKey ?? "")
        if (applied.some((item) => item.key === key)) {
          return { mode: "duplicate" } as const
        }
        applied.push({ type: event.type, key })
        return { mode: "applied", status: "active", currentPeriodEnd: null } as const
      }
      return { applied, apply: apply as never }
    }

    const donePayment = {
      paymentKey: "pk_1",
      orderId: ORDER_ID,
      status: "DONE",
      totalAmount: 49000,
      approvedAt: "2026-10-10T09:00:00+09:00",
      currency: "KRW"
    }

    const runCharge = async (
      handler: Parameters<typeof mockFetch>[0],
      ledger: ReturnType<typeof createLedger>
    ) => {
      const mock = mockFetch(handler)
      const result = await chargeSubscription(
        { secretKey: SECRET, fetchImpl: mock.impl },
        {
          organizationId: ORG,
          billingKey: "bk_1",
          customerKey: "fs-00000000000000000000000000000001",
          planCode: "standard",
          amount: plan.amount,
          orderId: ORDER_ID,
          orderName: "첫수업 스탠다드 구독",
          idempotencyKey: ORDER_ID,
          attemptKey: ATTEMPT_KEY,
          eventType: "renewal_succeeded",
          resolvePeriod: () => ({
            periodStart: "2026-10-10T00:00:00.000Z",
            periodEnd: "2026-11-10T00:00:00.000Z"
          }),
          applyEvent: ledger.apply
        }
      )
      return { result, calls: mock.calls }
    }

    // E/I. 승인 성공 → 성공 이벤트 1건
    {
      const ledger = createLedger()
      const { result } = await runCharge(() => ({ status: 200, body: donePayment }), ledger)
      check(result.status === "succeeded", `성공 결제가 ${result.status} 로 분류됐다`)
      check(
        ledger.applied.length === 1 && ledger.applied[0].type === "renewal_succeeded",
        `반영된 이벤트가 다르다: ${JSON.stringify(ledger.applied)}`
      )
    }

    // F/J. 카드사 거절 → 실패 이벤트 1건
    {
      const ledger = createLedger()
      const { result } = await runCharge((url, init) => {
        if (init.method === "GET") {
          return { status: 404, body: { code: "NOT_FOUND_PAYMENT" } }
        }
        return { status: 400, body: { code: "REJECT_CARD_COMPANY", message: "한도 초과" } }
      }, ledger)
      check(result.status === "declined", `거절이 ${result.status} 로 분류됐다`)
      check(
        ledger.applied.length === 1 && ledger.applied[0].type === "payment_failed",
        "실패 이벤트가 남지 않았다"
      )
    }

    // K. timeout → pending. 원장에 아무것도 쓰지 않는다.
    {
      const ledger = createLedger()
      const { result, calls } = await runCharge((url, init) => {
        if (init.method === "GET") {
          return { status: 500, body: { code: "SERVER_ERROR" } }
        }
        return "timeout"
      }, ledger)
      check(result.status === "pending", `불명이 ${result.status} 로 분류됐다`)
      check(ledger.applied.length === 0, "결과를 모르는데 원장에 썼다")
      check(calls.some((call) => call.init.method === "GET"), "불명일 때 결제 조회를 하지 않았다")
    }

    // K'. timeout 이지만 실제로는 결제가 됐던 경우 → 조회로 성공 확정
    {
      const ledger = createLedger()
      const { result } = await runCharge((url, init) => {
        if (init.method === "GET") {
          return { status: 200, body: donePayment }
        }
        return "timeout"
      }, ledger)
      check(result.status === "succeeded", "조회로 확인된 성공이 반영되지 않았다")
      check(ledger.applied.length === 1, "성공이 원장에 반영되지 않았다")
    }

    // G. 금액이 다른 결제 → 성공도 실패도 아니다
    {
      const ledger = createLedger()
      const { result } = await runCharge(
        () => ({ status: 200, body: { ...donePayment, totalAmount: 1000 } }),
        ledger
      )
      check(result.status === "mismatch", `금액 불일치가 ${result.status} 로 분류됐다`)
      check(ledger.applied.length === 0, "금액이 다른 결제를 반영했다")
    }

    // H. 같은 시도 재실행 → 결제 이벤트는 한 번만 반영된다
    {
      const ledger = createLedger()
      await runCharge(() => ({ status: 200, body: donePayment }), ledger)
      const second = await runCharge(() => ({ status: 200, body: donePayment }), ledger)
      check(second.result.status === "succeeded", "재실행이 실패했다")
      check(ledger.applied.length === 1, `같은 시도가 두 번 반영됐다: ${ledger.applied.length}`)
      const idempotencyHeaders = second.calls
        .filter((call) => call.init.method === "POST")
        .map((call) => (call.init.headers as Record<string, string>)["Idempotency-Key"])
      check(
        idempotencyHeaders.every((value) => value === ORDER_ID),
        "재실행이 다른 멱등키를 보냈다 — Toss 에서 이중 결제가 된다"
      )
    }
    passLine(before, "성공·거절·불명·불일치·재실행 분기가 계약대로 갈린다")
  }


  // ───────────────────────────────────────────────────────────
  console.log("\n[11] checkout 세션 저장소 (로컬 Supabase)")
  {
    const before = failures
    const ORG_ID = "b21e0000-0000-4000-8000-000000000011"
    const SESSION_ID = "b21e0000-0000-4000-8000-0000000000c1"
    const attempt = buildInitialBillingAttempt(SESSION_ID)

    const cleanup = async () => {
      await admin(`billing_checkout_sessions?organization_id=eq.${ORG_ID}`, { method: "DELETE" })
      await admin(`organizations?id=eq.${ORG_ID}`, { method: "DELETE" })
    }

    await cleanup()
    await admin("organizations", {
      method: "POST",
      body: JSON.stringify({ id: ORG_ID, name: "결제창 검증", branch_name: "본원" })
    })

    const insertSession = (id: string, orderId: string, key: string, customerKey: string) =>
      admin("billing_checkout_sessions", {
        method: "POST",
        body: JSON.stringify({
          id,
          organization_id: ORG_ID,
          customer_key: customerKey,
          plan_code: "standard",
          amount: 49000,
          order_id: orderId,
          payment_idempotency_key: key,
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        })
      })

    await insertSession(SESSION_ID, attempt.orderId, attempt.attemptKey, "fs-000000000000000000000000000000c1")

    // C. 조건부 claim 이 재생을 막는다. 두 번째 요청은 0행이다.
    const claim = async () => {
      const rows = (await admin(
        `billing_checkout_sessions?id=eq.${SESSION_ID}&status=eq.pending`,
        {
          method: "PATCH",
          body: JSON.stringify({ status: "authorized", authorized_at: new Date().toISOString() })
        }
      )) as Array<unknown>
      return rows.length
    }

    check((await claim()) === 1, "첫 callback 이 세션을 선점하지 못했다")
    check((await claim()) === 0, "두 번째 callback 도 세션을 선점했다 — 재생이 뚫린다")

    // 같은 조직이 결제창을 다시 열면 새 세션이 필요하다. 키는 겹치면 안 된다.
    const duplicateOrder = await admin("billing_checkout_sessions", {
      method: "POST",
      body: JSON.stringify({
        id: "b21e0000-0000-4000-8000-0000000000c2",
        organization_id: ORG_ID,
        customer_key: "fs-000000000000000000000000000000c2",
        plan_code: "standard",
        amount: 49000,
        order_id: attempt.orderId,
        payment_idempotency_key: "checkout:other",
        expires_at: new Date().toISOString()
      })
    }).then(
      () => "inserted",
      () => "rejected"
    )
    check(duplicateOrder === "rejected", "같은 주문번호로 세션이 두 개 만들어졌다")

    // 학원 계정(authenticated)은 결제 의도를 읽지도 만들지도 못한다.
    const anonRead = await fetch(
      `${REST_URL}/rest/v1/billing_checkout_sessions?select=id`,
      { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } }
    )
    check(anonRead.status !== 200, `anon 이 결제 의도를 읽었다: ${anonRead.status}`)

    await cleanup()
    passLine(before, "조건부 claim 1회 · 주문번호 유일 · 외부 읽기 차단")
  }


  // ───────────────────────────────────────────────────────────
  console.log("\n[12] 갱신 시도 시점")
  {
    const before = failures
    const periodEnd = "2026-10-10T00:00:00.000Z"
    const at = (offsetHours: number) =>
      new Date(new Date(periodEnd).getTime() + offsetHours * 60 * 60 * 1000)
    const active = {
      subscriptionStatus: "active",
      currentPeriodEnd: periodEnd,
      gracePeriodEnd: null,
      cancelAtPeriodEnd: false
    }

    check(decideRenewal(active, at(-1)).due === false, "기간이 남았는데 결제했다")
    const first = decideRenewal(active, at(0))
    check(first.due && first.attemptNumber === 0, "기간 종료 시점의 1차 시도가 안 잡혔다")

    // L. 유예 안의 재시도 — 차수가 하루마다 하나씩 올라간다.
    const pastDue = {
      subscriptionStatus: "past_due",
      currentPeriodEnd: periodEnd,
      gracePeriodEnd: "2026-10-13T00:00:00.000Z",
      cancelAtPeriodEnd: false
    }
    const retry1 = decideRenewal(pastDue, at(24))
    const retry2 = decideRenewal(pastDue, at(48))
    check(retry1.due && retry1.attemptNumber === 1, "2차 시도 차수가 다르다")
    check(retry2.due && retry2.attemptNumber === 2, "3차 시도 차수가 다르다")
    // 같은 시각이면 몇 번을 물어도 같은 차수다 — Cron 중복 실행이 이중 결제로 가지 않는다.
    check(
      JSON.stringify(decideRenewal(pastDue, at(30))) === JSON.stringify(decideRenewal(pastDue, at(30))),
      "같은 시각에 차수가 흔들린다"
    )
    // 유예가 끝나면 더 시도하지 않는다.
    const afterGrace = decideRenewal(pastDue, at(73))
    check(!afterGrace.due, "유예가 끝났는데 계속 결제를 시도한다")
    check(!afterGrace.due && afterGrace.reason === "grace_over", "유예 종료 사유가 다르다")

    // M. 해지 예약은 대상이 아니다 — 다음 결제를 부르지 않는 것이 해지 실행이다.
    const canceling = decideRenewal({ ...active, cancelAtPeriodEnd: true }, at(1))
    check(!canceling.due && canceling.reason === "cancel_at_period_end", "해지 예약 구독을 결제했다")

    // N. 수동 trialing(PoC)은 자동결제 대상이 아니다.
    const poc = decideRenewal(
      { ...active, subscriptionStatus: "trialing", currentPeriodEnd: "2026-12-31T14:59:59.000Z" },
      at(1)
    )
    check(!poc.due && poc.reason === "status_not_renewable", "trialing 구독이 자동결제 대상이 됐다")

    for (const status of ["canceled", "expired"]) {
      check(
        !decideRenewal({ ...active, subscriptionStatus: status }, at(1)).due,
        `${status} 구독을 결제했다`
      )
    }
    check(
      !decideRenewal({ ...active, currentPeriodEnd: null }, at(1)).due,
      "기간을 모르는데 결제했다"
    )
    passLine(before, "기간 종료 후 3일간 1일 간격 3회 · 해지예약/trialing/종료 제외")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[13] 갱신 대상 선정 (로컬 Supabase)")
  {
    const before = failures
    const DUE = "b21e0000-0000-4000-8000-000000000021"
    const POC = "b21e0000-0000-4000-8000-000000000022"
    const OVERRIDE_ONLY = "b21e0000-0000-4000-8000-000000000023"
    const NO_CARD = "b21e0000-0000-4000-8000-000000000024"
    const CANCELING = "b21e0000-0000-4000-8000-000000000025"
    const ORG_IDS = [DUE, POC, OVERRIDE_ONLY, NO_CARD, CANCELING]
    const filter = `in.(${ORG_IDS.join(",")})`
    const now = new Date()
    const past = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    const cleanup = async () => {
      await admin(`organization_billing_customers?organization_id=${filter}`, { method: "DELETE" })
      await admin(`organization_entitlement_overrides?organization_id=${filter}`, { method: "DELETE" })
      await admin(`organization_subscriptions?organization_id=${filter}`, { method: "DELETE" })
      await admin(`organizations?id=${filter}`, { method: "DELETE" })
    }

    await cleanup()
    await admin("organizations", {
      method: "POST",
      body: JSON.stringify(ORG_IDS.map((id, index) => ({ id, name: `갱신 검증 ${index}`, branch_name: "본원" })))
    })
    await admin("organization_subscriptions", {
      method: "POST",
      body: JSON.stringify([
        { organization_id: DUE, plan_code: "standard", subscription_status: "active", current_period_end: past, cancel_at_period_end: false },
        { organization_id: POC, plan_code: "standard", subscription_status: "trialing", current_period_end: future, cancel_at_period_end: false },
        { organization_id: NO_CARD, plan_code: "standard", subscription_status: "active", current_period_end: past, cancel_at_period_end: false },
        { organization_id: CANCELING, plan_code: "standard", subscription_status: "active", current_period_end: past, cancel_at_period_end: true }
      ])
    })
    await admin("organization_billing_customers", {
      method: "POST",
      body: JSON.stringify([
        {
          organization_id: DUE,
          provider: "toss",
          provider_customer_key: "fs-00000000000000000000000000000021",
          billing_key: "bk_due"
        },
        {
          organization_id: CANCELING,
          provider: "toss",
          provider_customer_key: "fs-00000000000000000000000000000025",
          billing_key: "bk_cancel"
        }
      ])
    })
    // O. 내부 전체 권한만 있고 구독은 없는 조직.
    await admin("organization_entitlement_overrides", {
      method: "POST",
      body: JSON.stringify({
        organization_id: OVERRIDE_ONLY,
        full_access: true,
        reason: "내부 검증"
      })
    })

    // findRenewalCandidates 와 같은 조건.
    const dueRows = (await admin(
      `organization_subscriptions?organization_id=${filter}` +
        `&subscription_status=in.(active,past_due)&cancel_at_period_end=is.false` +
        `&current_period_end=lte.${encodeURIComponent(now.toISOString())}` +
        `&select=organization_id`
    )) as Array<{ organization_id: string }>
    const cardRows = (await admin(
      `organization_billing_customers?organization_id=${filter}` +
        `&provider=eq.toss&billing_key_status=eq.active&select=organization_id`
    )) as Array<{ organization_id: string }>
    const cardOrgs = new Set(cardRows.map((row) => row.organization_id))
    const selected = dueRows.map((row) => row.organization_id).filter((id) => cardOrgs.has(id))

    check(JSON.stringify(selected) === JSON.stringify([DUE]), `선정 결과가 다르다: ${selected.join(",")}`)
    check(!selected.includes(POC), "N. 수동 trialing PoC 가 자동결제 대상이 됐다")
    check(!selected.includes(OVERRIDE_ONLY), "O. 내부 override 조직이 자동결제 대상이 됐다")
    check(!selected.includes(NO_CARD), "빌링키 없는 조직이 자동결제 대상이 됐다")
    check(!selected.includes(CANCELING), "M. 해지 예약 조직이 자동결제 대상이 됐다")

    await cleanup()
    passLine(before, "구독+빌링키만 대상 · PoC·override·해지예약 제외")
  }


  // ───────────────────────────────────────────────────────────
  console.log("\n[14] webhook 해석 · 주문번호 역추적")
  {
    const before = failures
    const ORG = "8cd6f7e4-fd75-48db-9b11-c7dfe43ef421"
    const SESSION = "3f2b1a44-0000-4000-8000-000000000abc"

    const body = {
      eventType: "PAYMENT_STATUS_CHANGED",
      createdAt: "2026-10-10T09:00:00.000000",
      data: { paymentKey: "pk_1", orderId: "fsc-3f2b1a4400004000800000000000abc", status: "DONE" }
    }

    const withId = parseTossWebhook(body, "trans-1")
    check(withId.ok && withId.envelope.eventId === "trans-1", "재전송 식별자를 쓰지 않았다")

    // P. 같은 사건이 재전송 식별자 없이 두 번 와도 같은 fingerprint 여야 한다.
    const first = parseTossWebhook(body, null)
    const second = parseTossWebhook(JSON.parse(JSON.stringify(body)), null)
    check(
      first.ok && second.ok && first.envelope.eventId === second.envelope.eventId,
      "같은 webhook 이 다른 식별자를 만든다 — 중복 차단이 안 된다"
    )
    const otherStatus = parseTossWebhook(
      { ...body, data: { ...body.data, status: "ABORTED" } },
      null
    )
    check(
      otherStatus.ok && first.ok && otherStatus.envelope.eventId !== first.envelope.eventId,
      "다른 상태 변경이 같은 식별자로 묶였다"
    )

    check(!parseTossWebhook(null, null).ok, "빈 body 가 통과했다")
    check(!parseTossWebhook({ data: {} }, null).ok, "eventType 없는 body 가 통과했다")
    check(
      HANDLED_WEBHOOK_EVENTS.has("PAYMENT_STATUS_CHANGED") &&
        HANDLED_WEBHOOK_EVENTS.has("BILLING_DELETED"),
      "처리 대상 이벤트가 다르다"
    )
    check(!HANDLED_WEBHOOK_EVENTS.has("DEPOSIT_CALLBACK"), "무관한 이벤트를 처리 대상으로 잡았다")

    // 주문번호 역추적. 우리가 만든 형식만 인식한다.
    const checkout = decodeBillingOrderId(buildInitialBillingAttempt(SESSION).orderId)
    check(
      checkout.kind === "checkout" && checkout.checkoutSessionId === SESSION,
      "checkout 주문번호를 되짚지 못했다"
    )

    const renewalOrder = buildRenewalBillingAttempt(ORG, "2026-10-10T00:00:00.000Z", 2)
    const renewal = decodeBillingOrderId(renewalOrder.orderId)
    check(
      renewal.kind === "renewal" &&
        renewal.organizationId === ORG &&
        renewal.attemptNumber === 2 &&
        expandBillingInstant(renewal.periodEndCompact) === "2026-10-10T00:00:00.000Z",
      `갱신 주문번호를 되짚지 못했다: ${JSON.stringify(renewal)}`
    )

    // Q. 남이 만든 주문번호는 인식하지 않는다.
    for (const forged of ["order_12345", "fsc-notahex", "fsr-abc", ""]) {
      check(
        decodeBillingOrderId(forged).kind === "unknown",
        `우리 것이 아닌 주문번호를 인식했다: ${forged}`
      )
    }
    passLine(before, "재전송 식별자·fingerprint·주문번호 역추적 · 위조 주문 거부")
  }

  // ───────────────────────────────────────────────────────────
  console.log("\n[15] webhook 중복 저장 (로컬 Supabase)")
  {
    const before = failures
    const EVENT_ID = "verify-toss-webhook-1"
    const cleanup = () =>
      admin(`billing_webhook_events?provider_event_id=eq.${EVENT_ID}`, { method: "DELETE" })

    await cleanup()
    const insert = () =>
      admin("billing_webhook_events", {
        method: "POST",
        body: JSON.stringify({
          provider: "toss",
          provider_event_id: EVENT_ID,
          event_type: "PAYMENT_STATUS_CHANGED",
          processing_status: "received"
        })
      }).then(
        () => "inserted",
        () => "rejected"
      )

    check((await insert()) === "inserted", "첫 webhook 이 기록되지 않았다")
    // P. 같은 이벤트 재전송 → 두 번째는 저장 자체가 거부된다.
    check((await insert()) === "rejected", "같은 webhook 이 두 번 기록됐다")

    const anonRead = await fetch(`${REST_URL}/rest/v1/billing_webhook_events?select=id`, {
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }
    })
    check(anonRead.status !== 200, `anon 이 webhook 기록을 읽었다: ${anonRead.status}`)

    // raw payload 를 통째로 담는 컬럼이 없다.
    const columns = (await admin("billing_webhook_events?select=*&limit=1")) as Array<
      Record<string, unknown>
    >
    if (columns.length > 0) {
      const names = Object.keys(columns[0])
      check(
        !names.some((name) => /payload|raw|body/.test(name)),
        `raw payload 컬럼이 있다: ${names.join(", ")}`
      )
    }

    await cleanup()
    passLine(before, "재전송 저장 거부 · 외부 읽기 차단 · raw payload 컬럼 없음")
  }

  if (failures > 0) {
    console.error(`\nFAIL: ${failures}건 실패`)
    process.exit(1)
  }

  console.log("\nPASS: Toss 자동결제 연동 계약 검증 완료")
}

run().catch((error) => {
  console.error("\n검증 중 예외:", error)
  process.exit(1)
})
