// 학원 탐색(/academies) 과 학원 상세(/academy/[handle]) 의 계약 검증.
//
//   npx tsx scripts/verify-parent-academy-discovery.ts
//
// 여기서 고정하는 것.
//   1. 학원 탐색은 secondary discovery 다 — Home 용 섹션을 들이지 않고, 홈 탭이 켜진다.
//   2. 학원명 · 지점명 · 붙여 쓴 형태 · 지역으로 검색된다(/classes 와 같은 규칙).
//   3. 지역 계약은 Home · Search 와 같은 catalog · canonicalization 을 쓴다.
//   4. 카드는 실제 공개 값만 그린다 — 별점 · 리뷰 · 순위 · BEST · 매칭률 없음.
//   5. 학원 카드와 수업 상세가 /academy/[handle] 로 연결된다. 깨진 주소를 만들지 않는다.
//   6. 학원 상세는 공개 수업(is_active = true)만 보여 준다.
//   7. UI 텍스트로 organization UUID 를 보여주지 않는다.
//   8. 학원 즐겨찾기 domain 을 새로 만들지 않는다.
//   9. public projection 을 넓히지 않았다 — 이미 조회하던 id 를 DTO 로만 올렸다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"

const LIST_PAGE = "app/academies/page.tsx"
const EXPLORER = "src/features/academies/ui/academies-explorer.tsx"
const LIST_QUERY = "src/features/academies/queries/get-academies-for-list.ts"
const DETAIL_PAGE = "app/academy/[handle]/page.tsx"
const DETAIL_QUERY = "src/features/academies/queries/get-public-academy-page.ts"
const ACADEMY_CLASSES_QUERY = "src/features/academies/queries/get-public-academy-classes.ts"
const CLASS_DETAIL = "app/classes/[id]/page.tsx"
const PROJECTION = "src/features/classes/queries/public-class-safe-projection.ts"
const ADAPTER = "src/shared/lib/db/adapter.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const listPage = codeOf(LIST_PAGE)
const explorer = codeOf(EXPLORER)
const listQuery = stripComments(read(LIST_QUERY))
const detailPage = codeOf(DETAIL_PAGE)
const detailQuery = stripComments(read(DETAIL_QUERY))
const academyClassesQuery = stripComments(read(ACADEMY_CLASSES_QUERY))
const classDetail = codeOf(CLASS_DETAIL)
const projection = stripComments(read(PROJECTION))
const adapter = read(ADAPTER)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("\n[1] 학원 탐색은 secondary discovery 다")

check("A) 공개 학원 목록 조회를 쓴다", listPage.includes("getAcademiesForList({"))
for (const [label, needle] of [
  ["브랜드 배너", "hero-banner-bg"],
  ["지금 확인해야 할 것", "지금 확인해야 할 것"],
  ["다가오는 수업", "다가오는 수업"],
  ["홈 큐레이션 카드", "HomeClassCard"]
] as const) {
  check(`Home 용 ${label} 을 들이지 않는다`, !listPage.includes(needle) && !explorer.includes(needle))
}
check("J) /academies 는 홈 탭이다", resolveParentNavTab("/academies") === "home")
check("J) /academy/* 도 홈 탭이다", resolveParentNavTab("/academy/some-handle") === "home")
check("공용 nav 를 쓴다", listPage.includes("<ParentBottomNav"))

console.log("\n[2] 학원 검색")

check("B) q query 를 받는다", listPage.includes("q?: string") && listPage.includes("resolvedSearchParams?.q"))
check("B) 조회로 검색어를 넘긴다", listPage.includes("query: selectedQuery"))
check("canonical redirect 가 검색어를 잃지 않는다", listPage.includes("q: selectedQuery"))
check(
  "B) 이름 · 지점 · 붙여 쓴 형태 · 지역을 모두 본다",
  listQuery.includes("organization.name,") &&
    listQuery.includes("organization.branch_name,") &&
    listQuery.includes("`${organization.name} ${organization.branch_name}`") &&
    listQuery.includes("regionLabel || null")
)
check("지점명이 없어도 안전하다", listQuery.includes("organization.branch_name ?"))
check("검색 비교는 정규화한다", listQuery.includes("const normalizeSearchText"))
check("검색 입력은 URL 을 따라간다", explorer.includes("initialQuery={initialQuery}"))
check(
  "검색 pill 은 /classes 와 같은 컴포넌트다",
  explorer.includes("ClassesSearchPill") && explorer.includes('placeholder="학원명, 지점명으로 찾기"')
)

console.log("\n[3] 지역 계약")

/*
 * 지역 catalog 자체는 화면마다 다르다 — 학원 목록은 학원 커버리지를 읽는다.
 * 같아야 하는 것은 URL 값을 해석하는 규칙과 위치 cookie 다.
 */
check(
  "C) 지역 해석 규칙이 Home · Search 와 같다",
  listPage.includes("canonicalizeRegionSelection(regionCatalog, rawRegionSelection)") &&
    listPage.includes("normalizeSearchRadiusKm")
)
check("C) 같은 위치 cookie 를 읽는다", listPage.includes("readParentSearchLocation"))
check("적용 중인 지역이 화면에 보인다", explorer.includes("<LocationFilter") && explorer.includes("label={locationLabel}"))
check("legacy region query 는 제거만 한다", listPage.includes("hasLegacyRegionQuery"))

console.log("\n[4] 카드는 실제 값만 그린다")

const FORBIDDEN_TEXT = ["별점", "리뷰", "인기", "BEST", "추천 학원", "매칭률", "순위"]
for (const term of FORBIDDEN_TEXT) {
  check(`K) "${term}" 을 만들지 않는다`, !explorer.includes(term) && !detailPage.includes(term))
}
/* "operatingHours" 안의 rating 을 오탐하지 않도록 단어 경계를 쓴다. */
const FORBIDDEN_IDENTIFIERS = [/\bratings?\b/i, /\breviewCount\b/, /\brankings?\b/i, /★/]
for (const pattern of FORBIDDEN_IDENTIFIERS) {
  check(
    `K) ${pattern} 식별자를 만들지 않는다`,
    !pattern.test(explorer) && !pattern.test(detailPage),
    (explorer.match(pattern) ?? detailPage.match(pattern))?.[0] ?? ""
  )
}
check(
  "카드가 학원명 · 지역 · 과목 · 대상을 실제 값으로 그린다",
  explorer.includes("{academy.displayName}") &&
    explorer.includes("buildAcademyLocationLabel(academy)") &&
    explorer.includes("academy.subjectTags.map") &&
    explorer.includes("{academy.targetAgeSummary}")
)
check(
  "학원 즐겨찾기를 새로 만들지 않았다",
  !explorer.includes("BookmarkButton") && !detailPage.includes("BookmarkButton")
)
/*
 * 동작하는 즐겨찾기뿐 아니라 "눌리지 않는 즐겨찾기 모양" 도 만들지 않는다.
 * 핸들러 없는 북마크 아이콘은 없는 기능을 있는 것처럼 말한다.
 */
check(
  "8) 누를 수 없는 즐겨찾기 자리표시자도 두지 않는다",
  !explorer.includes("academyBookmark") &&
    !detailPage.includes("academyBookmark") &&
    !explorer.includes("M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z") &&
    !detailPage.includes("M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z")
)
/* 학원 카드 CSS 에도 전용 스타일이 남지 않아야 한다. */
check(
  "8) 자리표시자 전용 CSS 가 남아 있지 않다",
  !read("app/academies/page.module.css").includes("academyBookmark")
)
check("빈 결과 문구가 있다", explorer.includes("조건에 맞는 학원이 아직 없어요."))

console.log("\n[5] 학원 상세 연결")

/* 이름과 하단 진입점 둘 다 학원 상세로 간다. 하나가 끊겨도 잡히게 개수로 본다. */
const academyHrefCount = explorer.match(/href=\{`\/academy\/\$\{academy\.id\}`\}/g)?.length ?? 0
check("D) 학원명이 상세로 간다", academyHrefCount >= 2, `${academyHrefCount}곳`)
check(
  "D) 카드에 학원 정보 진입점이 있다",
  explorer.includes("className={styles.secondaryAction}") && explorer.includes("학원 정보")
)
check(
  "H) 수업 상세에서 학원으로 갈 수 있다",
  classDetail.includes("const academyHref = organization?.id ? `/academy/${academy?.slug ?? organization.id}` : null")
)
check(
  "H) 식별자가 없으면 링크를 만들지 않는다",
  classDetail.includes("{academyHref ?")
)
check("I) 학원 상세의 수업이 수업 상세로 간다", detailPage.includes("href={`/classes/${item.id}`}"))
check(
  "route resolver 계약을 그대로 쓴다",
  detailQuery.includes("fetchAcademyPublicProfileBySlug") && detailQuery.includes("isUuid(normalizedHandle)")
)
check("canonical 은 slug 를 우선한다", detailPage.includes("academy.slug ?? academy.organizationId"))

console.log("\n[6] 학원 상세는 공개 수업만")

check(
  "F) is_active = true 만 읽는다",
  academyClassesQuery.includes('.eq("is_active", true)')
)
check("G) 숨긴 일정은 제외한다", academyClassesQuery.includes('.neq("booking_status", "hidden")'))
check("공개 조건을 새로 넓히지 않았다", !academyClassesQuery.includes("approval_status"))
check("공개 수업이 0건이면 그렇게 말한다", detailPage.includes("현재 신청 가능한 첫수업이 없어요."))
check("없는 수업을 만들어 채우지 않는다", !detailPage.includes("준비 중인 수업 예시"))
check("not found 계약이 그대로다", detailPage.includes("notFound()"))

console.log("\n[7] 공개 데이터 원칙")

for (const term of ["상담 메모", "CRM", "내부 담당자", "conversion", "assessment"]) {
  check(`E) 상세에 "${term}" 이 없다`, !detailPage.includes(term))
}
/* id 는 주소에만 쓴다. 화면 텍스트로 내보내지 않는다. */
check(
  "7) UUID 를 화면 텍스트로 보여주지 않는다",
  !explorer.includes(">{academy.id}<") &&
    !classDetail.includes("{organization.id}<") &&
    !detailPage.includes("{academy.organizationId}<")
)

console.log("\n[8] public projection 을 넓히지 않았다")

check(
  "9) 이미 조회하던 id 를 DTO 로만 올렸다",
  projection.includes('"id, name, branch_name') && projection.includes("id: row.id,")
)
check(
  "9) organization id 는 optional 이다(읽지 않는 경로가 있다)",
  adapter.includes("id?: string")
)
check(
  "9) 새 column 을 select 하지 않았다",
  !projection.includes("academy_public_profiles") && !projection.includes("slug")
)
check("학원 상세 route 가 그대로 있다", exists(DETAIL_PAGE) && exists(LIST_PAGE))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
