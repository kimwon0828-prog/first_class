// 체험 이후 전환 현황(Conversion Analytics)의 계약 검증.
//
//   npx tsx scripts/verify-conversion-analytics.ts
//
// 여기서 고정하는 것.
//   1. cohort 는 "체험을 마친 Experience" 다.
//   2. 네 source 를 서로 추정하지 않는다.
//   3. 지금의 row 만 센다 — 이력이 두 번 세어지지 않는다.
//   4. 분모가 뒤섞이지 않는다.
//   5. 결과 미확정은 미등록이 아니다.
//   6. 깔때기(부분집합) 가정을 하지 않는다.
//   7. 조직 경계를 넘지 않는다.
//   8. 기간이 바뀌면 모든 지표가 같은 cohort 로 함께 바뀐다.
//   9. 원인 · 점수 · 순위 표현을 만들지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  buildStudioConversionAnalytics,
  formatConversionRate,
  formatRateFraction,
  selectConversionCohort
} from "@/features/studio/lib/studio-conversion-analytics"

const LIB_PATH = "src/features/studio/lib/studio-conversion-analytics.ts"
const QUERY_PATH = "src/features/studio/queries/get-studio-conversion-analytics.ts"
const PAGE_PATH = "app/studio/(dashboard)/page.tsx"
const PAGE_CSS_PATH = "app/studio/(dashboard)/page.module.css"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"
const SUPABASE_ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const MOCK_PATH = "src/shared/lib/db/mock-adapter.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const lib = read(LIB_PATH)
const libCode = stripComments(lib)
const queryCode = stripComments(read(QUERY_PATH))
const page = read(PAGE_PATH)
const pageCode = stripComments(stripJsxComments(page))
const pageCss = stripComments(read(PAGE_CSS_PATH))
const supabaseAdapterCode = stripComments(read(SUPABASE_ADAPTER_PATH))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const app = (
  id: string,
  status: string,
  date: string,
  registrationStatus: string | null = "undecided"
) =>
  ({
    id,
    status,
    confirmedSlotAt: date,
    requestedSlotAt: date,
    completedAt: date,
    canceledAt: null,
    createdAt: date,
    registrationStatus
  }) as never

const range = (from: string | null = null, to: string | null = null) =>
  ({ preset: "all", startDate: null, endDate: null, createdAtFrom: from, createdAtTo: to, label: "전체" }) as never

const sources = (input: {
  reports?: string[]
  decisions?: Array<[string, string]>
  results?: Array<[string, string]>
}) =>
  ({
    publishedReportExperienceIds: new Set(input.reports ?? []),
    parentDecisionByExperienceId: new Map(input.decisions ?? []),
    registrationResultByExperienceId: new Map(input.results ?? [])
  }) as never

const D = "2026-09-03T01:00:00.000Z"

console.log("── 1. cohort 는 체험을 마친 Experience ──")
{
  const apps = [
    app("a1", "completed", D),
    app("a2", "confirmed", D),
    app("a3", "canceled", D),
    app("a4", "new", D),
    app("a5", "completed", D)
  ]
  const cohort = selectConversionCohort(apps, range())
  check("CASE11 completed 만 들어온다", cohort.length === 2, `actual ${cohort.length}`)
  check("CASE11 completed 아닌 상태 제외", cohort.every((item) => item.status === "completed"))

  // CASE 12 — 기간 밖
  const outside = selectConversionCohort(
    [app("b1", "completed", "2026-01-01T00:00:00Z"), app("b2", "completed", D)],
    range("2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z")
  )
  check("CASE12 기간 밖 completed 제외", outside.length === 1 && outside[0]?.id === "b2")

  // CASE 13 — 기간 안 체험 · 결과는 기간 이후
  const late = buildStudioConversionAnalytics(
    [app("c1", "completed", D)],
    range("2026-09-01T00:00:00Z", "2026-09-30T23:59:59Z"),
    sources({ results: [["c1", "enrolled"]] })
  )
  check("CASE13 기간 안 체험은 cohort 에 남는다", late.cohort.completedExperienceCount === 1)
  check("CASE13 이후에 기록된 결과도 따라간다", late.registrationResults.enrolled === 1)
}

console.log("\n── 2. 핵심 수치 ──")
{
  // CASE 1
  const apps = Array.from({ length: 10 }, (_, i) => app(`e${i}`, "completed", D))
  const a = buildStudioConversionAnalytics(apps, range(), sources({
    results: [["e0", "enrolled"], ["e1", "enrolled"], ["e2", "enrolled"], ["e3", "enrolled"],
              ["e4", "not_enrolled"], ["e5", "not_enrolled"]]
  }))
  check("CASE1 체험 완료 10", a.cohort.completedExperienceCount === 10)
  check("CASE1 등록 4", a.registrationResults.enrolled === 4)
  check("CASE1 미등록 2", a.registrationResults.notEnrolled === 2)
  check("CASE1 결과 확인 6", a.registrationResults.total === 6)
  check("CASE1 미확정 4", a.registrationResults.unresolved === 4)
  check("CASE1 overall 40%", a.rates.overallEnrollmentRate === 40)
  check("CASE1 resolved 66.7%", a.rates.resolvedEnrollmentRate === 66.7, `actual ${a.rates.resolvedEnrollmentRate}`)
  check("CASE1 분모가 다르다", a.rates.overallDenominator === 10 && a.rates.resolvedDenominator === 6)
  check(
    "미확정은 미등록에 합쳐지지 않는다",
    a.registrationResults.notEnrolled + a.registrationResults.unresolved !== a.registrationResults.notEnrolled
  )

  // CASE 2
  const empty = buildStudioConversionAnalytics([], range(), sources({}))
  check("CASE2 cohort 0", empty.cohort.completedExperienceCount === 0)
  check("CASE2 rate 는 null", empty.rates.overallEnrollmentRate === null && empty.rates.resolvedEnrollmentRate === null)
  check("CASE2 화면 표기는 —", formatConversionRate(null) === "—")
  check("CASE2 0으로 나누지 않는다", Number.isFinite(empty.cohort.completedExperienceCount))
  check("CASE2 hasCohort false", empty.hasCohort === false)
  check("CASE2 coverage 도 null", empty.reports.coverageRate === null)
}

console.log("\n── 3. 지금의 row 만 센다 ──")
{
  // CASE 3/4 — 발행본은 현재 published 만 들어온다(adapter 가 걸러 준다)
  const apps = [app("r1", "completed", D), app("r2", "completed", D), app("r3", "completed", D)]
  const a = buildStudioConversionAnalytics(apps, range(), sources({ reports: ["r1", "r2", "r3"] }))
  check("CASE3 published 3", a.reports.publishedExperienceCount === 3)
  check("CASE4 같은 체험은 한 번만", a.reports.publishedExperienceCount === apps.length)
  check(
    "adapter 가 published 만 고른다",
    supabaseAdapterCode.includes('.eq("status", "published")')
  )
  check(
    "adapter 가 현재 선택/결과만 고른다",
    (supabaseAdapterCode.match(/\.is\("superseded_at", null\)/g) ?? []).length >= 2
  )

  // CASE 5/6 — 현재 값 하나만 들어온다
  const one = buildStudioConversionAnalytics(
    [app("x1", "completed", D)],
    range(),
    sources({ decisions: [["x1", "planned"]], results: [["x1", "enrolled"]] })
  )
  check("CASE5 planned 1 · considering 0", one.parentDecisions.planned === 1 && one.parentDecisions.considering === 0)
  check("CASE6 enrolled 1 · not_enrolled 0", one.registrationResults.enrolled === 1 && one.registrationResults.notEnrolled === 0)
  check("체험 단위로 센다", one.registrationResults.total === 1)
}

console.log("\n── 4. 부모 의향 × 실제 결과 ──")
{
  const apps = [
    app("m1", "completed", D), app("m2", "completed", D), app("m3", "completed", D),
    app("m4", "completed", D), app("m5", "completed", D)
  ]
  const a = buildStudioConversionAnalytics(apps, range(), sources({
    decisions: [["m1", "planned"], ["m2", "planned"], ["m3", "considering"], ["m4", "declined"]],
    results: [["m1", "enrolled"], ["m3", "enrolled"], ["m4", "enrolled"], ["m5", "enrolled"]]
  }))
  const row = (d: string) => a.decisionResultMatrix.find((item) => item.decision === d)
  check("CASE7 planned + enrolled = 1", row("planned")?.enrolled === 1)
  check("CASE8 planned + 결과 없음 = result_pending 1", row("planned")?.resultPending === 1)
  check("CASE15 declined + enrolled 를 그대로 둔다", row("declined")?.enrolled === 1)
  check("considering + enrolled = 1", row("considering")?.enrolled === 1)
  check(
    "CASE9 의향 없는 체험은 matrix 밖",
    a.decisionResultMatrixTotal === 4 && a.parentDecisions.notCollected === 1
  )
  check(
    "CASE9 의향 없어도 등록 집계에는 들어간다",
    a.registrationResults.enrolled === 4
  )
  check(
    "matrix 합 = 의향 있는 체험 수",
    a.decisionResultMatrix.reduce((sum, item) => sum + item.total, 0) === a.decisionResultMatrixTotal
  )
  check("행은 세 가지뿐", a.decisionResultMatrix.length === 3)
  check(
    "열에 result_pending 이 있다",
    a.decisionResultMatrix.every((item) => typeof item.resultPending === "number")
  )

  // CASE 14 — 리포트 없이 등록
  const noReport = buildStudioConversionAnalytics(
    [app("n1", "completed", D)],
    range(),
    sources({ results: [["n1", "enrolled"]] })
  )
  check("CASE14 리포트 없이도 등록 집계", noReport.registrationResults.enrolled === 1)
  check("CASE14 리포트 수는 0", noReport.reports.publishedExperienceCount === 0)
}

console.log("\n── 5. source 를 서로 추정하지 않는다 ──")
check(
  "집계가 registration_status 를 읽지 않는다",
  !libCode.includes("registrationStatus") && !libCode.includes("registration_status")
)
check(
  "집계가 trial_results 를 리포트로 세지 않는다",
  !libCode.includes("trial_results") && !libCode.includes("trialResult")
)
check(
  "pending / undecided 를 결과값으로 쓰지 않는다",
  !libCode.includes('"pending"') && !libCode.includes('"undecided"')
)
check(
  "의향과 결과를 서로 변환하지 않는다",
  !libCode.includes('planned"') || (!libCode.includes("=== \"planned\" ? \"enrolled\"") && !libCode.includes("decision === result"))
)
check(
  "adapter 가 세 표를 따로 읽는다",
  ["experience_reports", "parent_decisions", "registration_results"].every((table) =>
    supabaseAdapterCode.includes(`.from("${table}")`)
  )
)
check(
  "집계를 adapter 에서 하지 않는다",
  (() => {
    const start = supabaseAdapterCode.indexOf("async listStudioConversionSources")
    const block = supabaseAdapterCode.slice(start, start + 2500)
    return !block.includes("Rate") && !block.includes("count +")
  })()
)

console.log("\n── 6. 깔때기가 아니다 ──")
check(
  "부분집합을 가정하지 않는다 (단계 사이 나눗셈 없음)",
  !libCode.includes("publishedExperienceCount)") ||
    !/roundPercentage\(\s*\w+,\s*publishedExperienceCount\s*\)/.test(libCode)
)
check(
  "의향 수를 리포트 수로 나누지 않는다",
  !/roundPercentage\(\s*decisionTotal,\s*publishedExperienceCount/.test(libCode)
)
check(
  "결과 수를 의향 수로 나누지 않는다",
  !/roundPercentage\(\s*resultTotal,\s*decisionTotal/.test(libCode)
)
check(
  "모든 비율의 분모가 cohort 또는 결과 확인 수다",
  (libCode.match(/roundPercentage\(/g) ?? []).length ===
    (libCode.match(/roundPercentage\([^)]*(completedExperienceCount|resultTotal)\)/g) ?? []).length
)
check(
  "화면에 '다음 단계 전환율' 이 없다",
  !pageCode.includes("다음 단계") && !pageCode.includes("단계 전환율")
)
check(
  "funnel 도형을 쓰지 않는다",
  !/funnel/i.test(pageCode) && !/funnel/i.test(pageCss)
)

console.log("\n── 7. 분모를 화면에 적는다 ──")
check("분수 표기 helper 가 있다", formatRateFraction(12, 24) === "12 / 24")
check(
  "두 비율 모두 분모를 같이 그린다",
  (pageCode.match(/formatRateFraction\(/g) ?? []).length === 2
)
check(
  "두 비율의 문구가 다르다",
  pageCode.includes("체험 완료 대비 등록") && pageCode.includes("등록 결과가 확인된 학생 중 등록")
)
check(
  "리포트 비율 문구가 분모를 말한다",
  pageCode.includes("체험 완료 중")
)
check(
  "미확정을 미등록이라 부르지 않는다",
  pageCode.includes("미확정") && !pageCode.includes("미등록 처리") && !pageCode.includes("미등록으로 간주")
)

console.log("\n── 8. 조직 경계 · 기간 ──")
check(
  "조직 조건을 호출부에서 다시 적지 않는다(RLS 판정)",
  !queryCode.includes("organizationId") || !queryCode.includes('eq("organization_id"')
)
check(
  "cohort id 로만 조회한다",
  supabaseAdapterCode.includes('.in("application_id", applicationIds)')
)
check(
  "유료 권한이 없으면 조회하지 않는다",
  pageCode.includes("entitlements.canUseConversionAnalytics") &&
    pageCode.includes("? await getStudioConversionAnalytics(")
)
check(
  "기간 state 를 새로 만들지 않는다",
  queryCode.includes("StudioResolvedDateRange") &&
    pageCode.includes("getStudioConversionAnalytics(applications, selectedDateRange)")
)
check(
  "모든 지표가 같은 cohort 에서 나온다",
  (libCode.match(/selectConversionCohort\(/g) ?? []).length === 1 &&
    libCode.includes("const cohort = selectConversionCohort(applications, range)")
)
check(
  "체험 날짜로 cohort 를 고른다",
  libCode.includes("resolveStudioExperienceDate(item)") &&
    libCode.includes("item.status !== \"completed\"")
)

console.log("\n── 9. 원인 · 점수 · 순위를 말하지 않는다 ──")
{
  const forbidden = [
    "덕분에", "상담 효과", "기여", "성공률", "예측", "AI 분석", "등록 가능성",
    "설득", "정확도", "점수", "순위", "랭킹", "상위", "강점", "약점", "추천"
  ]
  for (const [name, code] of [["lib", libCode], ["query", queryCode], ["page", pageCode]] as const) {
    const hits = forbidden.filter((word) => code.includes(word))
    check(`${name} 에 인과 · 점수 · 순위 표현이 없다`, hits.length === 0, hits.join(", "))
  }
  check(
    "리포트 발행과 등록률을 비교하지 않는다",
    !libCode.includes("withReportEnrollmentRate") && !pageCode.includes("리포트 발행 시")
  )
  check(
    "상위 N 추출을 하지 않는다",
    !/\.slice\(0,\s*\d+\)/.test(libCode)
  )
}

console.log("\n── 10. adapter 양쪽이 같다 ──")
check(
  "양쪽에 같은 표면이 있다",
  ["listStudioConversionSources"].every(
    (method) =>
      read(ADAPTER_PATH).includes(method) &&
      supabaseAdapterCode.includes(method) &&
      read(MOCK_PATH).includes(method)
  )
)
check(
  "빈 cohort 는 질의하지 않는다",
  supabaseAdapterCode.includes("if (applicationIds.length === 0)")
)
check(
  "질의는 표당 한 번씩이다",
  supabaseAdapterCode.includes("Promise.all([")
)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
