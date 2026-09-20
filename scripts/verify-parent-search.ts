// 수업찾기(/classes) Search 화면의 계약 검증.
//
//   npx tsx scripts/verify-parent-search.ts
//
// 여기서 고정하는 것.
//   1. /classes 는 Search 전용이다. Home 요소가 하나도 없다.
//   2. URL 이 검색 상태의 source of truth 다 — 입력값 · 선택 상태가 URL 을 따라간다.
//   3. 필터 하나를 바꿔도 나머지 query 를 임의로 지우지 않는다.
//      상위 과목이 바뀌어 세부 과목이 무효가 되는 경우에만 subject 를 지운다.
//   4. subject query 계약은 code 다(UUID 를 URL 에 노출하지 않는다).
//   5. 저장된 위치에서 온 반경 필터가 화면에 보이고, 해제할 수단이 있다.
//   6. 지점명(branch_name)으로 검색된다 — 학원명 + 지점명 결합 검색 포함.
//   7. 공개 조건은 classes.is_active = true 그대로다.
//   8. 결과 · 빈 결과 · 오류 · 초기화 상태가 서로 구분된다.
//   9. 결과 카드는 실제로 있는 값만 그린다(별점 · 점수 · 일치율 없음).
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { buildClassesHref } from "@/features/classes/lib/classes-href"
import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"

const SEARCH_PATH = "app/classes/page.tsx"
const SEARCH_CSS_PATH = "app/classes/page.module.css"
const PROJECTION_PATH = "src/features/classes/queries/public-class-safe-projection.ts"
const CONTEXT_PATH = "src/features/classes/queries/resolve-class-discovery-context.ts"
const SUBJECT_QUERY_PATH = "src/features/subjects/lib/subject-query.ts"
const CARD_PATH = "src/features/classes/ui/class-card.tsx"
const SCHEDULE_PATH = "src/features/classes/queries/get-public-class-card-schedule-summaries.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const search = codeOf(SEARCH_PATH)
const detailFilter = codeOf("src/features/classes/ui/classes-subject-filter.tsx")
const searchCss = stripComments(read(SEARCH_CSS_PATH))
const projection = stripComments(read(PROJECTION_PATH))
const context = stripComments(read(CONTEXT_PATH))
const subjectQuery = stripComments(read(SUBJECT_QUERY_PATH))
const card = codeOf(CARD_PATH)
const schedule = stripComments(read(SCHEDULE_PATH))
const navCode = stripComments(read("src/features/classes/ui/parent-bottom-nav.tsx"))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const indexOfAll = (source: string, parts: readonly string[]) => parts.map((part) => source.indexOf(part))
const inOrder = (source: string, parts: readonly string[]) => {
  const positions = indexOfAll(source, parts)
  return positions.every((value, index) => value > 0 && (index === 0 || value > positions[index - 1]))
}

console.log("\n[1] /classes 는 Search 전용이다")

for (const [label, needle] of [
  ["브랜드 배너", "hero-banner-bg"],
  ["지금 확인할 것", "지금 확인할 것"],
  ["다가오는 수업", "다가오는 수업"],
  ["홈 큐레이션 카드", "HomeClassCard"],
  ["과목 shortcut 섹션", "과목별 둘러보기"],
  ["Partner CTA", "파트너 신청하기"],
  ["marketing footer", "ParentFooter"],
  ["개인화 조회", "getParentHomeSummary"]
] as const) {
  check(`Search 에 ${label} 이(가) 없다`, !search.includes(needle))
}
check("Search 는 자기 이름을 말한다", search.includes("수업찾기</h1>"))
/* /classes 는 Home 에서 시작하는 검색의 결과 화면이라 홈 탭이 켜진다. */
check("독립 탐색 화면은 하단 nav 없이 뒤로 이동한다", !search.includes("<ParentBottomNav") && search.includes('aria-label="홈으로 이동"'))
check("/classes 에서는 홈 탭이 active 다", resolveParentNavTab("/classes") === "home")
check("검색 결과에서도 홈 탭이다", resolveParentNavTab("/classes/abc") === "home")
check('하단 탭에 "수업찾기" 라벨이 없다', !navCode.includes('label: "수업찾기"'))

console.log("\n[2] 화면 순서")

const SECTION_ORDER = [
  "searchTitle",
  "<LocationFilter",
  "<ClassesSearchPill",
  'aria-label="과목 대분류"',
  "<ClassesSubjectFilter",
  "activeFilterSection",
  "resultMeta",
  "resultGrid"
] as const
// 순서는 render tree 안에서만 본다. 위쪽 계산식의 등장 순서는 화면 순서가 아니다.
const searchRender = search.slice(search.indexOf("  return ("))
check(
  "헤더 → 지역/자녀 → 검색 → 과목/세부 과목 → 적용 조건 → 결과",
  inOrder(searchRender, SECTION_ORDER),
  String(indexOfAll(searchRender, SECTION_ORDER))
)

console.log("\n[3] URL 이 검색 상태의 source of truth 다")

check("검색 입력값은 URL 의 q 다", search.includes('initialQuery={selectedQuery ?? ""}'))
check(
  "placeholder 가 검색 대상을 말한다",
  search.includes('placeholder="수업명 또는 학원명을 검색해보세요"')
)
check(
  "과목 선택 상태가 URL 을 따라간다",
  search.includes("selectedSubjectCategory?.id === category.id") &&
    search.includes("styles.subjectSelected") &&
    search.includes('aria-current={isActive ? "page" : undefined}')
)
check(
  "세부 과목은 선택된 category 의 실제 subject 만 보여 준다",
  search.includes("selectedSubjectCategory.subjects.map")
)
check(
  "세부 과목 sheet 는 category 가 선택됐을 때만 나온다",
  search.includes("{selectedSubjectCategory ? <ClassesSubjectFilter")
)

console.log("\n[4] 필터 조합 보존")

check(
  "필터 링크는 지금 걸린 조건을 모두 싣고 한 칸만 바꾼다",
  search.includes("const buildSearchHref = (") &&
    search.includes("subjectCategory: selectedSubjectCategory?.code ?? null") &&
    search.includes("subject: selectedSubject?.code ?? null") &&
    search.includes("q: selectedQuery") &&
    search.includes("radius: radiusQueryValue") &&
    search.includes("...regionQueryValues") &&
    search.includes("...overrides")
)
check(
  "상위 과목이 바뀔 때만 세부 과목을 지운다",
  search.includes("buildSearchHref({ subjectCategory: category.code, subject: null })")
)
check(
  "세부 과목만 바꿀 때는 상위 과목을 유지한다",
  detailFilter.includes('params.set("subjectCategory", categoryCode)') && detailFilter.includes('params.set("subject", draft)') && detailFilter.includes("new URLSearchParams(searchParams.toString())")
)
check(
  "'전체' 과목은 category 와 subject 만 지운다",
  search.includes("buildSearchHref({ subjectCategory: null, subject: null })")
)
check("검색 조건 초기화는 지역/자녀를 보존한다", search.includes('href={buildSearchHref({ q: null, subjectCategory: null, subject: null })} className={styles.resetFilterButton}') && search.includes("child: selectedChildId"))
check(
  "검색어를 비우면 q 만 지운다(공유 pill 의 계약)",
  stripComments(read("src/features/classes/ui/classes-region-select.tsx")).includes(
    "{ q: normalized || null }"
  )
)

console.log("\n[5] subject query 계약은 code 다")

check("URL 은 category.code 를 쓴다", search.includes("subjectCategory: category.code"))
check("URL 은 subject.code 를 쓴다", detailFilter.includes("value={subject.code}") && detailFilter.includes('params.set("subject", draft)'))
check("UUID 를 URL 에 쓰지 않는다", !search.includes("subjectCategory: category.id") && !search.includes("subject: subject.id"))
check(
  "DB 필터는 id 로 내려간다(기존 계약)",
  context.includes("subjectCategoryId: selectedSubjectCategory?.id") &&
    context.includes("subjectId: selectedSubject?.id")
)
check("code → 선택 해석은 기존 resolver 가 한다", subjectQuery.includes("item.code === decodedSubjectCategory"))

console.log("\n[6] 저장된 위치에서 온 반경 필터")

check(
  "반경이 적용 중이면 조건 목록에 드러난다",
  search.includes('isNearbyMode ? { key: "nearby", label: `내 주변 ${radiusKm}km`')
)
check(
  "반경을 해제할 수단이 있다",
  search.includes("clearSearchLocationAction") && search.includes("<form action={clearNearbyLocationAction}>")
)
check("지역 필터 라벨이 현재 상태를 말한다", context.includes("현재 위치 · ${radiusKm}km"))
check(
  "지역을 바꿔도 검색어 · 과목이 남는다",
  search.includes("buildSearchHref({ sido: null, sigungu: null, bname: null })")
)

console.log("\n[7] 지점명 검색")

check("검색 대상에 지점명이 있다", projection.includes("const branchName = organization?.branch_name ?? null"))
check(
  "학원명과 지점명을 붙여 쓴 형태도 찾는다",
  projection.includes("organizationName && branchName ? `${organizationName} ${branchName}` : null")
)
check(
  "지점명이 없어도 안전하다",
  projection.includes("organization?.branch_name ?? null") &&
    projection.includes("haystacks.map(normalizeText)")
)
check(
  "학원명 검색은 그대로다",
  projection.includes("organizationName,")
)

console.log("\n[8] 공개 조건은 그대로다")

check(
  'classes.is_active = true 필터가 남아 있다',
  projection.includes('.eq("is_active", true)'),
  projection.includes('.eq("is_active", true)') ? "" : "공개 조건이 사라졌다"
)
/* 목록 질의와 상세 질의를 각각 본다 — 한쪽만 남아도 공개 조건이 깨진다. */
const listQuery = projection.slice(
  projection.indexOf("const buildPublicClassesQuery"),
  projection.indexOf("const toOrganizationLocation")
)
const detailQuery = projection.slice(projection.indexOf("export const getPublicClassDetailWithSafeProjection"))
check("목록 질의가 is_active 를 건다", listQuery.includes('.eq("is_active", true)'))
check(
  "상세 질의가 is_active 를 건다",
  (detailQuery.match(/\.eq\("is_active", true\)/g)?.length ?? 0) >= 2,
  String(detailQuery.match(/\.eq\("is_active", true\)/g)?.length ?? 0)
)
check(
  "승인 상태 같은 새 공개 조건을 추가하지 않았다",
  !projection.includes("approval_status") && !projection.includes("approved_at")
)

console.log("\n[9] 결과 · 빈 결과 · 오류 · 초기화")

check("결과 개수는 실제 개수다", search.includes("const resultCount = classes.length"))
check(
  "결과 제목은 개수만 표시하고 검색어는 해제 가능한 chip 에 남는다",
  search.includes('const resultMetaText = `수업 ${resultCount}개`') && search.includes('key: "q", label: `"${selectedQuery}"`')
)
check("빈 결과 문구가 따로 있다", search.includes("조건에 맞는 수업이 없어요."))
check("빈 결과에 다음 행동을 준다", search.includes("검색어나 필터를 바꿔 다시 찾아보세요."))
check("오류는 QueryResult 의 error 를 쓴다", search.includes("{error ? (") && search.includes("수업을 불러오지 못했어요.") && !search.includes("{error}</p>"))
check("오류와 빈 결과가 다른 분기다", search.includes("} : resultCount === 0 ? (".replace("} : ", "") ) || search.includes(") : resultCount === 0 ? ("))
check("복수 조건에만 검색 초기화를 한 번 표시한다", search.includes("activeFilters.length > 1") && search.includes("{hasMultipleFilters ?") && search.split("검색 조건 초기화").length === 2)

console.log("\n[10] 결과 카드는 실제 값만 그린다")

check("Search 는 기존 ClassCard 를 쓴다", search.includes("<ClassCard"))
check("Home 카드를 쓰지 않는다", !search.includes("<HomeClassCard"))
check("대상 학년은 적혀 있을 때만 말한다", search.includes('gradeLabel === "정보 준비 중" ? null : gradeLabel'))
check(
  "예약 가능 일정은 실제 일정이 있을 때만 붙는다",
  search.includes("scheduleSummaryByClassId.get(item.id)?.summaryLabel ?? null") &&
    !schedule.includes("예약 가능 일정 확인")
)
check("관심수업 기능이 살아 있다", card.includes("<BookmarkButton"))
check("비교 카드는 과목 · 대상을 제목 앞에 그린다", card.includes("{gradeLabel ?") && card.indexOf("{secondaryLabel ?") < card.indexOf("<h3"))

const FORBIDDEN = ["일치율", "% 일치", "BEST", "AI 추천", "추천 점수", "랭킹", "적합도", "매칭 점수", "리뷰"]
for (const term of FORBIDDEN) {
  check(`"${term}" 을 쓰지 않는다`, !search.includes(term) && !card.includes(term))
}
check("별점을 그리지 않는다", !/★|평점|rating|reviewCount/i.test(search + card))
check("Search CSS 에 별점 스타일이 없다", !/★|\bstars?\b|\brating\b/i.test(searchCss))
check(
  "emoji 를 production icon 으로 쓰지 않는다",
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(search)
)

console.log("\n[11] 검색은 사용자가 실행할 때만 일어난다")

/* ClassesSearchPill 본문만 떼어 본다. 같은 파일의 다른 컴포넌트와 섞이지 않게. */
const pillSource = (() => {
  const all = codeOf("src/features/classes/ui/classes-region-select.tsx")
  const from = all.indexOf("export function ClassesSearchPill")
  const to = all.indexOf("export function", from + 10)
  return to < 0 ? all.slice(from) : all.slice(from, to)
})()

check("돋보기가 실제 submit 버튼이다", pillSource.includes('<button type="submit" aria-label="검색"'))
check("form 이 submit 에서만 검색한다", pillSource.includes("submitQuery()") && pillSource.includes("event.preventDefault()"))
check(
  "타이핑은 입력값만 바꾼다",
  pillSource.includes("setValue(event.target.value)") &&
    !/onChange=\{\([\s\S]*?router\./.test(pillSource)
)
check("debounce timer 가 없다", !pillSource.includes("setTimeout") && !pillSource.includes("debounceRef"))
check("scheduleApply 가 없다", !pillSource.includes("scheduleApply"))
check(
  "router 호출은 submit 경로에만 있다",
  (pillSource.match(/router\.(push|replace)\(/g)?.length ?? 0) === 2 &&
    pillSource.indexOf("router.push(") > pillSource.indexOf("const submitQuery = ()")
)
check(
  "밖에서 URL 이 바뀌면 input 이 따라간다",
  pillSource.includes("setValue(initialQuery)") && pillSource.includes("}, [initialQuery])")
)
check(
  "submit 은 q 만 set/delete 한다",
  pillSource.includes("{ q: normalized || null }")
)
check(
  "나머지 query 는 그대로 실린다",
  stripComments(read("src/features/classes/ui/classes-region-select.tsx")).includes(
    "const params = new URLSearchParams(current.toString())"
  )
)
check("입력이 비어도 submit 전에는 q 를 지우지 않는다", !pillSource.includes("value === \"\" ?"))

console.log("\n[11] href builder")

check("기본은 /classes 다", buildClassesHref() === "/classes")
check(
  "조합이 순서대로 실린다",
  buildClassesHref({ subjectCategory: "math", subject: "thinking_math", q: "사고력" }) ===
    `/classes?subjectCategory=math&subject=thinking_math&q=${encodeURIComponent("사고력")}`,
  buildClassesHref({ subjectCategory: "math", subject: "thinking_math", q: "사고력" })
)
check(
  "null 은 실리지 않는다",
  buildClassesHref({ subjectCategory: "math", subject: null, q: null }) === "/classes?subjectCategory=math"
)
check("Search page 가 존재한다", existsSync(resolve(process.cwd(), SEARCH_PATH)))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
