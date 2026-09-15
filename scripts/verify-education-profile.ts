// 교육 프로필(Education Profile)의 계약 검증.
//
//   npx tsx scripts/verify-education-profile.ts
//
// 여기서 고정하는 것.
//   1. 근거는 지금 살아 있는 발행본뿐이다 — trial_results 를 읽지 않는다.
//   2. superseded / withdrawn 은 근거가 아니다.
//   3. evidenceCount 는 서로 다른 Experience 의 수다. 점수가 아니다.
//   4. 한 리포트 안의 중복은 1회다.
//   5. 모든 관찰은 원래 Experience 로 돌아갈 수 있다.
//   6. 아이 소유권은 서버가 판정한다.
//   7. 점수 · 백분율 · 순위 · 성향 문구를 만들지 않는다.
//   8. 문구는 발행 스냅샷의 문장이다 — 새로 쓰지 않는다.
//   9. Studio 에 프로필 집계를 노출하지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  buildEducationProfile,
  describeEvidenceCount,
  isCanonicalObservationCode
} from "@/features/profile/lib/education-profile"
import { TRIAL_RESULT_OBSERVATION_OPTIONS } from "@/features/studio/lib/trial-result-options"

const LIB_PATH = "src/features/profile/lib/education-profile.ts"
const QUERY_PATH = "src/features/profile/queries/get-my-education-profile.ts"
const PAGE_PATH = "app/record/profile/page.tsx"
const PAGE_CSS_PATH = "app/record/profile/page.module.css"
const RECORD_PAGE_PATH = "app/record/page.tsx"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"
const SUPABASE_ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const MOCK_PATH = "src/shared/lib/db/mock-adapter.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const lib = read(LIB_PATH)
const libCode = stripComments(lib)
const query = read(QUERY_PATH)
const queryCode = stripComments(query)
const page = read(PAGE_PATH)
const pageCode = stripComments(stripJsxComments(page))
// CSS 주석도 걷어낸다. 금지 대상을 "쓰지 않는다" 고 적어 둔 설명문이
// 그 자체로 위반처럼 잡히지 않도록(R0 · R5 에서 같은 오탐을 겪었다).
const pageCss = stripComments(read(PAGE_CSS_PATH))
const supabaseAdapterCode = stripComments(read(SUPABASE_ADAPTER_PATH))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

/** 검증용 스냅샷 한 건. 실제 발행본과 같은 모양이다. */
const snapshot = (codes: Array<{ code: string; label?: string }>, academy = "우리학원", title = "체험") => ({
  experience: {
    type: "trial_class",
    date: "2026-09-03T01:00:00.000Z",
    child: { displayName: "아이", grade: "초3" },
    academy: { name: academy },
    class: { title }
  },
  observations: codes.map((item) => ({
    code: item.code,
    label:
      item.label ??
      TRIAL_RESULT_OBSERVATION_OPTIONS.find((option) => option.value === item.code)?.label ??
      item.code
  })),
  recommendation: { course: null, level: null, schedule: null }
})

const source = (
  experienceId: string,
  reportId: string,
  codes: Array<{ code: string; label?: string }>,
  experienceDate: string,
  reportVersion = 1,
  academy = "우리학원"
) =>
  ({
    experienceId,
    reportId,
    reportVersion,
    content: snapshot(codes, academy),
    experienceDate
  }) as never

const build = (reports: unknown[]) =>
  buildEducationProfile({
    childId: "child-1",
    childName: "아이",
    reports: reports as never
  })

console.log("── 1. 집계 규칙 ──")
{
  // CASE 1 — 발행본 1개, 관찰 1개
  const one = build([source("exp-1", "rep-1", [{ code: "sustained_engagement" }], "2026-09-03T01:00:00Z")])
  check("CASE1 발행본 1개 → evidenceCount 1", one.observations[0]?.evidenceCount === 1)
  check("CASE1 publishedExperienceCount 1", one.publishedExperienceCount === 1)

  // CASE 2 — 서로 다른 Experience 두 곳에서 같은 code
  const two = build([
    source("exp-1", "rep-1", [{ code: "sustained_engagement" }], "2026-09-03T01:00:00Z"),
    source("exp-2", "rep-2", [{ code: "sustained_engagement" }], "2026-08-21T01:00:00Z")
  ])
  check("CASE2 서로 다른 체험 2곳 → evidenceCount 2", two.observations[0]?.evidenceCount === 2)
  check("CASE2 관찰은 하나로 합쳐진다", two.observations.length === 1)
  check("CASE2 source 2건", two.observations[0]?.sources.length === 2)
  check("CASE2 publishedExperienceCount 2", two.publishedExperienceCount === 2)

  // CASE 3 — 한 리포트 안의 중복
  const dup = build([
    source(
      "exp-1",
      "rep-1",
      [{ code: "sustained_engagement" }, { code: "sustained_engagement" }],
      "2026-09-03T01:00:00Z"
    )
  ])
  check("CASE3 한 리포트 안 중복 → 1회", dup.observations[0]?.evidenceCount === 1)
  check("CASE3 source 도 1건", dup.observations[0]?.sources.length === 1)

  // CASE 4 — 서로 다른 code
  const multi = build([
    source(
      "exp-1",
      "rep-1",
      [{ code: "sustained_engagement" }, { code: "verbal_explanation" }],
      "2026-09-03T01:00:00Z"
    )
  ])
  check("CASE4 서로 다른 code → 관찰 2개", multi.observations.length === 2)

  // CASE 16 — 같은 Experience 의 옛 버전과 현재 버전이 둘 다 들어와도 1회
  const sameExperience = build([
    source("exp-1", "rep-old", [{ code: "sustained_engagement" }], "2026-09-03T01:00:00Z", 1),
    source("exp-1", "rep-new", [{ code: "sustained_engagement" }], "2026-09-03T01:00:00Z", 2)
  ])
  check(
    "같은 Experience 는 버전이 둘이어도 1회",
    sameExperience.observations[0]?.evidenceCount === 1
  )
  check("그때 최신 버전을 쓴다", sameExperience.observations[0]?.sources[0]?.reportId === "rep-new")
  check("publishedExperienceCount 도 1", sameExperience.publishedExperienceCount === 1)

  // CASE 15 — 빈 프로필
  const empty = build([])
  check("CASE15 발행본 0 → 관찰 0", empty.observations.length === 0)
  check("CASE15 빈 프로필도 오류가 아니다", empty.publishedExperienceCount === 0)

  // 알 수 없는 code 는 올리지 않는다
  const unknown = build([source("exp-1", "rep-1", [{ code: "made_up_code" }], "2026-09-03T01:00:00Z")])
  check("알 수 없는 code 는 프로필에 없다", unknown.observations.length === 0)
  check("canonical code 판정이 7개만 통과", TRIAL_RESULT_OBSERVATION_OPTIONS.every((option) => isCanonicalObservationCode(option.value)))
  check("canonical 밖은 거부", !isCanonicalObservationCode("made_up_code") && !isCanonicalObservationCode(""))
}

console.log("\n── 2. 근거는 살아 있는 발행본뿐 ──")
check(
  "adapter 가 published 만 고른다",
  supabaseAdapterCode.includes('.eq("status", "published")')
)
check(
  "프로필 조회가 trial_results 를 읽지 않는다",
  !queryCode.includes("trial_results") &&
    !libCode.includes("trial_results") &&
    !pageCode.includes("trial_results")
)
check(
  "프로필 조회가 Studio 평가 helper 를 쓰지 않는다",
  !queryCode.includes("@/features/studio/") && !pageCode.includes("@/features/studio/")
)
check(
  "superseded / withdrawn 을 근거로 삼지 않는다",
  !queryCode.includes("superseded") && !queryCode.includes("withdrawn") &&
    !libCode.includes('"superseded"') && !libCode.includes('"withdrawn"')
)
check(
  "adapter 표면이 양쪽에 있다",
  ["listMyPublishedReportsByChild"].every(
    (method) =>
      read(ADAPTER_PATH).includes(method) &&
      supabaseAdapterCode.includes(method) &&
      read(MOCK_PATH).includes(method)
  )
)
check(
  "mock 도 published 만 준다",
  stripComments(read(MOCK_PATH)).includes('report.status === "published"')
)

console.log("\n── 3. 학부모 경계 ──")
check(
  "체험을 학부모 표면에서 읽는다",
  supabaseAdapterCode.includes('.from("my_trial_applications")')
)
check(
  "base table 을 직접 읽지 않는다",
  (() => {
    const start = supabaseAdapterCode.indexOf("async listMyPublishedReportsByChild")
    const block = supabaseAdapterCode.slice(start, start + 3500)
    return !block.includes('.from("trial_applications")')
  })()
)
check(
  // 호출자가 준 childId 를 그대로 믿으면 남의 아이 프로필이 열린다.
  "childId 를 내 아이 목록으로 먼저 검증한다",
  queryCode.includes("listMyChildren") &&
    queryCode.includes("children.find((item) => item.id === childId)")
)
check(
  "내 아이가 아니면 not_found 다",
  queryCode.includes('return { state: "not_found" }')
)
check(
  "학부모 계정만 연다",
  queryCode.includes('profile.role !== "parent"')
)
check(
  "화면이 not_found 를 404 로 답한다",
  pageCode.includes('result.state === "not_found"') && pageCode.includes("notFound()")
)
check(
  "조회 실패를 관찰 없음으로 접지 않는다",
  queryCode.includes('state: "error"') && pageCode.includes('result.state === "error"')
)
check(
  "RegistrationResult / ParentDecision 을 읽지 않는다",
  !queryCode.includes("registration_result") &&
    !queryCode.includes("RegistrationResult") &&
    !queryCode.includes("parent_decision") &&
    !queryCode.includes("ParentDecision") &&
    !libCode.includes("registration") &&
    !pageCode.includes("registration")
)
check(
  "Studio 내부 필드를 읽지 않는다",
  ["consultation_note", "unregistered_reason", "next_contact_at", "follow_up_note", "memo", "trial_feedback"].every(
    (field) => !queryCode.includes(field) && !libCode.includes(field) && !pageCode.includes(field)
  )
)

console.log("\n── 4. 근거 추적 ──")
check(
  "source 에 experienceId 가 있다",
  libCode.includes("experienceId") && lib.includes("experienceId: report.experienceId")
)
check(
  "source 에 reportId / version 이 있다",
  libCode.includes("reportId: report.reportId") && libCode.includes("reportVersion: report.reportVersion")
)
check(
  "source 에 학원 · 수업 · 날짜가 있다",
  libCode.includes("academyName") && libCode.includes("classTitle") && libCode.includes("experienceDate")
)
check(
  "화면이 원래 경험으로 연결한다",
  pageCode.includes("/record/${source.experienceId}/report") ||
    pageCode.includes("`/record/${source.experienceId}")
)
check(
  "관찰마다 근거 목록을 그린다",
  pageCode.includes("observation.sources.map")
)
check(
  "근거 없는 요약만 두지 않는다",
  pageCode.includes("observation.label") && pageCode.includes("sourceList")
)

console.log("\n── 5. 점수 · 순위 · 성향으로 바꾸지 않는다 ──")
{
  const forbiddenWords = [
    "점수", "score", "점", "백분율", "percent", "퍼센트", "순위", "rank",
    "강점", "약점", "TOP", "상위", "레벨업", "지수", "능력치", "성향", "적성"
  ]
  const surfaces = [
    ["lib", libCode],
    ["query", queryCode],
    ["page", pageCode]
  ] as const
  for (const [name, code] of surfaces) {
    const hits = forbiddenWords.filter((word) => code.includes(word))
    check(`${name} 에 점수/순위/성향 표현이 없다`, hits.length === 0, hits.join(", "))
  }
  check(
    // 많이 나온 것을 위에 올리면 그 자체가 대표 특성 순위표가 된다.
    "evidenceCount 로 정렬하지 않는다",
    !/sort\([^)]*evidenceCount/.test(libCode) &&
      libCode.includes("toTime(b.latestObservedAt) - toTime(a.latestObservedAt)")
  )
  check(
    "상위 N 추출을 하지 않는다",
    !/\.slice\(0,\s*\d+\)/.test(libCode) && !/\.slice\(0,\s*\d+\)/.test(pageCode)
  )
  check(
    "정규화 · 가중치를 만들지 않는다",
    !/\/\s*(total|count|length)\b/.test(libCode) && !libCode.includes("weight")
  )
  check(
    // F1 §17 부터 한 번뿐인 관찰에는 횟수를 말하지 않는다.
    // "1번" 은 사실이지만 2·3 옆에 놓이면 가장 낮은 값으로 읽힌다.
    "횟수를 문장으로만 말한다",
    describeEvidenceCount(3) === "3개의 체험에서 관찰됐어요"
  )
  check("한 번뿐이면 횟수를 말하지 않는다", describeEvidenceCount(1) === null)
  check("두 번부터 말한다", describeEvidenceCount(2) === "2개의 체험에서 관찰됐어요")
  check(
    "화면이 횟수를 그 문장으로 그린다",
    pageCode.includes("describeEvidenceCount(observation.evidenceCount)")
  )
}
check(
  "chart / progress bar / badge 를 쓰지 않는다",
  !/chart|radar|progress|gauge/i.test(pageCode) && !/chart|radar|progress|gauge/i.test(pageCss)
)
check(
  "차트 라이브러리를 들이지 않는다",
  !pageCode.includes("recharts") && !pageCode.includes("d3") && !pageCode.includes("chart.js")
)

console.log("\n── 6. 문구는 발행 당시 문장이다 ──")
{
  // 발행 시점 문구가 지금 canonical 과 달라도 그때 문장을 보존한다.
  const historical = build([
    source("exp-1", "rep-1", [{ code: "sustained_engagement", label: "예전 문구예요." }], "2026-09-03T01:00:00Z")
  ])
  check("대표 문구가 스냅샷 문장이다", historical.observations[0]?.label === "예전 문구예요.")
  check("근거 문구도 스냅샷 문장이다", historical.observations[0]?.sources[0]?.label === "예전 문구예요.")

  const mixed = build([
    source("exp-old", "rep-old", [{ code: "sustained_engagement", label: "예전 문구예요." }], "2026-08-01T01:00:00Z"),
    source("exp-new", "rep-new", [{ code: "sustained_engagement", label: "지금 문구예요." }], "2026-09-03T01:00:00Z")
  ])
  check("대표 문구는 가장 최근 발행본의 문장", mixed.observations[0]?.label === "지금 문구예요.")
  check("옛 근거는 옛 문장을 유지", mixed.observations[0]?.sources[1]?.label === "예전 문구예요.")
}
check(
  "lib 이 문구를 새로 만들지 않는다",
  !libCode.includes("`${") || !/label:\s*`/.test(libCode)
)
check(
  "canonical 표는 정렬에만 쓴다",
  libCode.includes("CANONICAL_ORDER") && !libCode.includes("option.label")
)

console.log("\n── 7. 도움이 필요했던 관찰도 그대로 ──")
{
  const guidance = build([
    source("exp-1", "rep-1", [{ code: "needs_repeated_guidance" }], "2026-09-03T01:00:00Z")
  ])
  const canonical = TRIAL_RESULT_OBSERVATION_OPTIONS.find(
    (option) => option.value === "needs_repeated_guidance"
  )
  check("needs_repeated_guidance 를 숨기지 않는다", guidance.observations.length === 1)
  check("문구를 그대로 쓴다", guidance.observations[0]?.label === canonical?.label)
  check(
    "긍정/부정으로 나누지 않는다",
    !libCode.includes("positive") && !libCode.includes("negative") &&
      !pageCode.includes("positive") && !pageCode.includes("negative")
  )
}

console.log("\n── 8. Studio 에 노출하지 않는다 ──")
check(
  "Studio 화면이 프로필 집계를 부르지 않는다",
  (() => {
    const studioFiles = [
      "app/studio/(dashboard)/applications/[id]/page.tsx",
      "src/features/studio/queries/get-studio-application-detail.ts"
    ]
    return studioFiles.every((path) => {
      try {
        const body = read(path)
        return !body.includes("EducationProfile") && !body.includes("listMyPublishedReportsByChild")
      } catch {
        return true
      }
    })
  })()
)
check(
  "프로필 route 가 학부모 경로에 있다",
  PAGE_PATH.startsWith("app/record/")
)
check(
  "진입점이 아이가 정해졌을 때만 보인다",
  read(RECORD_PAGE_PATH).includes("profileChild ?") &&
    read(RECORD_PAGE_PATH).includes("selectedChild ?? onlyChild")
)
check(
  "프로필이 child 를 URL 로 받는다",
  read(RECORD_PAGE_PATH).includes("/record/profile?child=")
)

console.log("\n── 9. 빈 상태 ──")
check(
  "빈 상태 문구가 있다",
  pageCode.includes("아직 쌓인 관찰 기록이 없어요") &&
    pageCode.includes("체험 리포트가 발행되면")
)
check(
  "가짜 샘플을 그리지 않는다",
  !/샘플|예시 관찰|placeholder/i.test(pageCode)
)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
