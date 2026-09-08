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

import {
  chargeTossBillingKey,
  getTossPaymentByOrderId,
  issueTossBillingKey
} from "@/features/billing/lib/toss/client"
import { generateTossCustomerKey, isValidTossCustomerKey } from "@/features/billing/lib/toss/customer-key"
import {
  buildInitialBillingAttempt,
  buildRenewalBillingAttempt
} from "@/features/billing/lib/toss/identifiers"
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
