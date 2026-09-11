// production 카드사 심사 예외의 판정 계약 검증.
//
//   npx tsx scripts/verify-toss-review-mode.ts
//
// 여기서 고정하는 것.
//   1. production + test 키에서 일반 조직은 계속 차단된다(test_key_in_production).
//   2. 같은 조건에서 심사용 조직 하나만 열리고 reviewMode=true 다.
//   3. live 키는 심사용 조직이어도 절대 열리지 않는다(fail closed).
//   4. review env 가 없으면 판정이 기존 production 정책과 완전히 같다.
//   5. preview / development 의 기존 동작이 달라지지 않는다.
//
// 순수 함수만 쓴다. DB·네트워크·process.env 를 건드리지 않는다.

import {
  isTossReviewOrganization,
  resolveTossBillingMode,
  type TossBillingMode,
  type TossDeploymentEnvironment,
  type TossKeyEnvironment
} from "@/features/billing/lib/toss/keys"

const REVIEW_ORG = "aa000000-0000-4000-8000-0000000000ff"
const NORMAL_ORG = "bb000000-0000-4000-8000-0000000000ee"

let failures = 0

const describe = (mode: TossBillingMode) =>
  mode.allowed ? `allowed(reviewMode=${mode.reviewMode})` : `blocked(${mode.code})`

const expectMode = (
  label: string,
  input: {
    deployment: TossDeploymentEnvironment
    keyEnvironment: TossKeyEnvironment
    allowLive: boolean
    review?: { reviewOrganizationId: string | null; organizationId: string | null }
  },
  expected: string
) => {
  const actual = describe(resolveTossBillingMode(input))
  const ok = actual === expected
  if (!ok) {
    failures += 1
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}\n        expected ${expected} | actual ${actual}`)
}

const expectBool = (label: string, actual: boolean, expected: boolean) => {
  const ok = actual === expected
  if (!ok) {
    failures += 1
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  (expected ${expected}, got ${actual})`)
}

const review = (organizationId: string | null, reviewOrganizationId: string | null = REVIEW_ORG) => ({
  reviewOrganizationId,
  organizationId
})

console.log("── 1. production + test key ──")
expectMode(
  "일반 조직은 계속 차단된다",
  { deployment: "production", keyEnvironment: "test", allowLive: false, review: review(NORMAL_ORG) },
  "blocked(test_key_in_production)"
)
expectMode(
  "심사용 조직만 열린다",
  { deployment: "production", keyEnvironment: "test", allowLive: false, review: review(REVIEW_ORG) },
  "allowed(reviewMode=true)"
)
expectMode(
  "조직을 모르면 차단된다",
  { deployment: "production", keyEnvironment: "test", allowLive: false, review: review(null) },
  "blocked(test_key_in_production)"
)

console.log("\n── 2. review env 미설정 = 기존 production 정책과 동일 ──")
expectMode(
  "env unset 이면 심사용 UUID 라도 차단",
  {
    deployment: "production",
    keyEnvironment: "test",
    allowLive: false,
    review: review(REVIEW_ORG, null)
  },
  "blocked(test_key_in_production)"
)
expectMode(
  "review 인자 자체가 없으면 차단",
  { deployment: "production", keyEnvironment: "test", allowLive: false },
  "blocked(test_key_in_production)"
)

console.log("\n── 3. live key 는 심사용 조직이어도 열리지 않는다 ──")
expectMode(
  "production + live + allowLive=false + 심사용 조직",
  { deployment: "production", keyEnvironment: "live", allowLive: false, review: review(REVIEW_ORG) },
  "blocked(live_billing_not_enabled)"
)
expectMode(
  "preview + live + allowLive=false + 심사용 조직",
  { deployment: "preview", keyEnvironment: "live", allowLive: false, review: review(REVIEW_ORG) },
  "blocked(live_billing_not_enabled)"
)
expectMode(
  "allowLive=true 는 review 예외가 아니라 정식 live 경로다",
  { deployment: "production", keyEnvironment: "live", allowLive: true, review: review(REVIEW_ORG) },
  "allowed(reviewMode=false)"
)

console.log("\n── 4. preview / development 기존 동작 유지 ──")
expectMode(
  "preview + test (일반 조직)",
  { deployment: "preview", keyEnvironment: "test", allowLive: false, review: review(NORMAL_ORG) },
  "allowed(reviewMode=false)"
)
expectMode(
  "development + test (조직 없음)",
  { deployment: "development", keyEnvironment: "test", allowLive: false },
  "allowed(reviewMode=false)"
)

console.log("\n── 5. 조직 대조는 정확 일치만 인정한다 ──")
expectBool("정확히 같으면 true", isTossReviewOrganization(review(REVIEW_ORG)), true)
expectBool("앞뒤 공백은 무시한다", isTossReviewOrganization(review(` ${REVIEW_ORG} `)), true)
expectBool("다른 조직은 false", isTossReviewOrganization(review(NORMAL_ORG)), false)
expectBool("대문자는 다른 값이다", isTossReviewOrganization(review(REVIEW_ORG.toUpperCase())), false)
expectBool("prefix 만 같으면 false", isTossReviewOrganization(review(REVIEW_ORG.slice(0, 20))), false)
expectBool("빈 문자열끼리는 false", isTossReviewOrganization(review("", "")), false)
expectBool("env 만 있고 조직이 없으면 false", isTossReviewOrganization(review(null)), false)
expectBool("조직만 있고 env 가 없으면 false", isTossReviewOrganization(review(REVIEW_ORG, null)), false)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
