// 공개 Marketplace 가 요금제에 중립인지 검증.
//
//   npx tsx scripts/verify-marketplace-neutrality.ts
//
// 이 파일은 verify-marketplace-boost.ts + verify-marketplace-ranking.ts 를 대체한다.
// 두 verifier 는 "스탠다드가 무료보다 위에 온다" 를 정상 동작으로 고정하고 있었다.
// 정책이 뒤집혔으므로 계약도 뒤집는다 — 삭제가 아니라 반대 방향의 보호다.
//
// 여기서 고정하는 계약(AGENTS.md 요금제 정책).
//   1. 학부모가 보는 순서는 학원이 돈을 냈는지와 무관하다.
//   2. Marketplace 입점은 무료·스탠다드 공통이다. 사라진 것은 "우대" 뿐이다.
//   3. 공개 목록 질의는 결제 사실을 아예 읽지 않는다.
//   4. billing 화면이 우선 노출을 팔지 않는다.
//
// ⚠️ 일부러 DB 를 쓰지 않는다.
//    이전 두 verifier 는 로컬 Supabase 가 필요해 실제로는 거의 돌지 않았다.
//    돌지 않는 verifier 는 아무것도 지키지 못한다. 요금제 중립성은 소스에서
//    증명할 수 있다 — 질의가 결제 정보를 참조하지 않으면 순위가 갈릴 수 없다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { getPlanEntitlements } from "@/features/billing/lib/entitlements"
import {
  buildFeatureComparison,
  buildPricingCards,
  resolveBillingPresentation
} from "@/features/billing/lib/subscription-presentation"

const PUBLIC_CLASSES_QUERY_PATH = "src/features/classes/queries/public-class-safe-projection.ts"
const ENTITLEMENTS_PATH = "src/features/billing/lib/entitlements.ts"
const BILLING_PRESENTATION_PATH = "src/features/billing/lib/subscription-presentation.ts"
const REMOVAL_MIGRATION_PATH =
  "supabase/migrations/20260918090000_remove_marketplace_paid_ranking_boost.sql"
const PAID_ACCESS_MIGRATION_PATH =
  "supabase/migrations/20260910090000_close_paid_access_when_period_ends.sql"

const PARENT_SOURCE_DIRS = [
  "src/features/classes",
  "src/features/academies",
  "app/classes",
  "app/academies"
]

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")

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

// 주석은 뺀다 — "요금제를 보지 않는다" 라고 적은 주석 자체가 걸리면 안 된다.
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const listSourceFiles = (dir: string): string[] => {
  const { readdirSync, statSync, existsSync } = require("node:fs") as typeof import("node:fs")
  const full = resolve(process.cwd(), dir)
  if (!existsSync(full)) {
    return []
  }

  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const next = `${current}/${entry}`
      if (statSync(next).isDirectory()) {
        walk(next)
      } else if (/\.tsx?$/.test(entry)) {
        out.push(next)
      }
    }
  }
  walk(full)
  return out
}

// ─────────────────────────────────────────────────────────────
console.log("\n[1] entitlement 계약에 우선 노출이 없다")
{
  const before = failures
  const source = read(ENTITLEMENTS_PATH)

  check(!source.includes("hasMarketplaceRankingBoost"), "boost entitlement 가 아직 남아 있다")
  // false 로만 남겨 죽은 기능처럼 유지하는 것도 막는다.
  check(!/boost/i.test(stripComments(source)), "boost 관련 식별자가 계약에 남아 있다")

  const free = getPlanEntitlements("free")
  const standard = getPlanEntitlements("standard")
  check(!("hasMarketplaceRankingBoost" in free), "FREE 에 boost key 가 남아 있다")
  check(!("hasMarketplaceRankingBoost" in standard), "STANDARD 에 boost key 가 남아 있다")

  // 입점 자체는 사라지지 않는다. 없앤 것은 우대뿐이다.
  check(free.canListOnMarketplace === true, "FREE 가 Marketplace 에 입점하지 못한다")
  check(standard.canListOnMarketplace === true, "STANDARD 가 Marketplace 에 입점하지 못한다")

  passLine(before, "boost flag 제거 · 입점은 무료/스탠다드 공통 유지")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[2] 공개 수업 목록이 결제 사실을 읽지 않는다")
{
  const before = failures
  const source = stripComments(read(PUBLIC_CLASSES_QUERY_PATH))

  // 결제와 우대를 가리키는 모든 식별자.
  for (const banned of [
    "marketplace_ranked_classes",
    "marketplace_boosted_organizations",
    "boost_eligible",
    "organization_subscriptions",
    "organization_has_paid_access",
    "plan_code",
    "subscription"
  ]) {
    check(!source.includes(banned), `공개 목록 질의가 ${banned} 를 참조한다`)
  }

  // 정렬 키는 created_at 하나다. 여기에 키가 하나 더 붙으면 우대가 되살아난다.
  const orderCalls = [...source.matchAll(/\.order\(\s*["']([^"']+)["']/g)].map((match) => match[1])
  check(
    JSON.stringify(orderCalls) === JSON.stringify(["created_at"]),
    `공개 목록 정렬 키가 created_at 하나가 아니다: ${orderCalls.join(", ") || "(없음)"}`
  )

  // 조회 대상은 classes 테이블이다.
  check(source.includes('.from("classes")'), "공개 목록이 classes 를 직접 읽지 않는다")

  passLine(before, "결제 참조 0 · 정렬 키 created_at 하나 · classes 직접 조회")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[3] 같은 수업이면 요금제가 달라도 순위가 같다")
{
  const before = failures
  const source = stripComments(read(PUBLIC_CLASSES_QUERY_PATH))

  // 구조적 증명이다. 질의 함수가 조직의 요금제를 입력으로 받지도, 조회하지도 않으므로
  // 같은 수업 데이터에 대해 Free 와 Standard 가 다른 결과를 만들 방법이 없다.
  check(
    !/getOrganizationEntitlements|getPlanEntitlements|resolveStudioEntitlements|billedPlanCode/.test(
      source
    ),
    "공개 목록 질의가 요금제 해석기를 호출한다"
  )
  check(
    !/entitlement/i.test(source),
    "공개 목록 질의가 entitlement 를 참조한다"
  )

  passLine(before, "요금제 입력 없음 → Free/Standard 결과 동일")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[4] billing 이 우선 노출을 팔지 않는다")
{
  const before = failures
  const source = read(BILLING_PRESENTATION_PATH)

  check(!source.includes("우선 노출"), "billing copy 에 우선 노출 문구가 남아 있다")
  check(!source.includes("hasMarketplaceRankingBoost"), "billing 이 boost entitlement 를 읽는다")

  const rows = buildFeatureComparison()
  check(
    !rows.some((row) => row.label.includes("우선 노출")),
    "기능 비교표에 우선 노출 행이 남아 있다"
  )
  // 입점 행은 남아 있고, 무료에서도 참이다.
  const listingRow = rows.find((row) => row.label === "Marketplace 입점")
  check(Boolean(listingRow), "Marketplace 입점 행이 사라졌다")
  check(listingRow?.free === true && listingRow?.standard === true, "입점이 유료 전용으로 표시된다")

  const cards = buildPricingCards(
    resolveBillingPresentation({
      resolved: {
        entitlements: getPlanEntitlements("free"),
        billedPlanCode: "free",
        hasInternalFullAccess: false
      },
      subscription: null,
      hasActiveBillingMethod: false,
      standardAmount: 49000
    }),
    { billingAvailable: true, standardAmount: 49000 }
  )
  for (const card of cards) {
    check(
      !card.benefits.some((benefit) => benefit.includes("우선 노출")),
      `${card.name} 카드가 우선 노출을 혜택으로 적는다`
    )
  }

  // 빈자리를 미구현 기능으로 채우지 않는다.
  const standardCard = cards.find((card) => card.planCode === "standard")
  for (const banned of ["AI", "고급 대시보드", "내보내기", "export"]) {
    check(
      !standardCard?.benefits.some((benefit) => benefit.includes(banned)),
      `스탠다드 카드에 미구현 기능이 들어갔다: ${banned}`
    )
  }

  passLine(before, "카드·비교표에 우선 노출 없음 · 입점 행 유지 · 미구현 기능 미노출")
}

// ─────────────────────────────────────────────────────────────
console.log("\n[5] Parent 화면에 결제 우대 표식이 없다")
{
  const before = failures
  const offenders: string[] = []

  for (const dir of PARENT_SOURCE_DIRS) {
    for (const file of listSourceFiles(dir)) {
      const source = stripComments(readFileSync(file, "utf8"))
      if (/boost|우선 노출|스폰서|sponsored|프리미엄 학원|유료 학원/i.test(source)) {
        offenders.push(file.replace(`${process.cwd()}/`, ""))
      }
    }
  }

  check(offenders.length === 0, `Parent 화면에 결제 우대 표식이 있다: ${offenders.join(", ")}`)
  passLine(before, `검사한 파일에서 우대 표식 0건`)
}

// ─────────────────────────────────────────────────────────────
console.log("\n[6] DB view 가 제거됐다")
{
  const before = failures
  const migration = read(REMOVAL_MIGRATION_PATH)

  check(
    /drop view if exists public\.marketplace_ranked_classes/i.test(migration),
    "ranked view 를 제거하지 않는다"
  )
  check(
    /drop view if exists public\.marketplace_boosted_organizations/i.test(migration),
    "boosted view 를 제거하지 않는다"
  )
  // 의존 순서. ranked 가 boosted 를 참조하므로 ranked 를 먼저 지워야 한다.
  check(
    migration.indexOf("marketplace_ranked_classes") <
      migration.lastIndexOf("marketplace_boosted_organizations"),
    "view 제거 순서가 의존 관계와 반대다"
  )
  // 살려 두는 것: 입점 자체와 billing 판정 함수.
  check(!/drop\s+table[\s\S]*classes/i.test(migration), "classes 테이블을 건드린다")
  check(
    !/drop function[\s\S]*organization_has_paid_access/i.test(migration),
    "Marketplace 정리를 핑계로 billing 함수까지 지운다"
  )
  check(
    read(PAID_ACCESS_MIGRATION_PATH).includes("create or replace function public.organization_has_paid_access"),
    "organization_has_paid_access 정의가 사라졌다"
  )

  passLine(before, "두 view 제거 · 순서 정상 · classes/billing 함수 보존")
}

if (failures > 0) {
  console.error(`\nFAIL: ${failures}건 실패`)
  process.exit(1)
}

console.log("\nPASS: Marketplace 요금제 중립성 검증 완료")
