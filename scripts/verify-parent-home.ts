// Parent Home(/) 과 수업찾기(/classes) 의 route · IA 계약 검증.
//
//   npx tsx scripts/verify-parent-home.ts
//
// 여기서 고정하는 것.
//   1. / 와 /classes 는 서로 다른 page 다. root 가 classes page 를 re-export 하지 않는다.
//   2. Home 은 카탈로그가 아니다 — 큐레이션 몇 개만 보여 주고 나머지는 /classes 로 넘긴다.
//   3. Home 은 개인화 근거가 있을 때와 없을 때 render tree 자체가 다르다(CSS order 금지).
//   4. 근거 없는 개인화 문구를 쓰지 않는다.
//   5. Search 는 Home 것(배너 · 지금 확인할 것 · 다가오는 수업 · 홈 큐레이션)을 들이지 않는다.
//   6. view=browse 는 더 이상 없다.
//   7. 하단 탭은 홈 / · 수업찾기 /classes · 기록 /record · 마이페이지 /my 넷이고
//      favorites 는 탭에 없지만 route 는 살아 있다.
//   8. canonical 은 / 와 /classes 로 갈린다.
//   9. query 계약(q · subjectCategory · subject · radius · sido · sigungu · bname)은 그대로다.
//  10. 가짜 개인화 지표를 만들지 않는다.
//  11. 삭제 금지 route 가 전부 남아 있다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  PARENT_HOME_UPCOMING_LIMIT,
  formatChildChipLabel,
  formatHomeScheduleLabel,
  selectUpcomingExperiences
} from "@/features/classes/lib/parent-home"
import { buildClassesHref } from "@/features/classes/lib/classes-href"
import type { ChildProfile, ParentApplicationSummary } from "@/shared/lib/db/adapter"

const HOME_PATH = "app/page.tsx"
const HOME_CSS_PATH = "app/page.module.css"
const SEARCH_PATH = "app/classes/page.tsx"
const CONTEXT_PATH = "src/features/classes/queries/resolve-class-discovery-context.ts"
const NAV_PATH = "src/features/classes/ui/parent-bottom-nav.tsx"
const LIB_PATH = "src/features/classes/lib/parent-home.ts"
const QUERY_PATH = "src/features/classes/queries/get-parent-home-summary.ts"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"
const PACKAGE_PATH = "package.json"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // URL 안의 "//" 를 줄 주석으로 오해하지 않는다.
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const homeCode = codeOf(HOME_PATH)
const homeCss = stripComments(read(HOME_CSS_PATH))
const searchCode = codeOf(SEARCH_PATH)
const contextCode = stripComments(read(CONTEXT_PATH))
const navCode = stripComments(read(NAV_PATH))
const libCode = stripComments(read(LIB_PATH))
const queryCode = stripComments(read(QUERY_PATH))
const adapter = read(ADAPTER_PATH)
const packageJson = JSON.parse(read(PACKAGE_PATH)) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const application = (
  overrides: Partial<ParentApplicationSummary> & { id: string }
): ParentApplicationSummary => ({
  classId: "class-1",
  classTitle: "영어 레벨테스트",
  classProgramType: "level_test",
  academyName: "미래학당 일산본원",
  organizationAddress: null,
  organizationAddressDetail: null,
  childId: "child-1",
  childName: "김사랑",
  childGrade: "초6",
  requestedScheduleBlockId: null,
  requestedSlotAt: "2026-09-20T01:00:00.000Z",
  confirmedSlotAt: null,
  completedAt: null,
  canceledAt: null,
  status: "new",
  canCollectParentDecision: false,
  canCancel: false,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides
})

const child = (overrides: Partial<ChildProfile> & { id: string }): ChildProfile => ({
  parentId: "parent-1",
  name: "김사랑",
  grade: "초6",
  schoolName: null,
  notes: null,
  currentLevel: null,
  interestSubjects: null,
  goalNote: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides
})

/** 이름 있는 render tree 한 덩어리를 그대로 떼어 온다. */
const treeBody = (source: string, name: string) => {
  const from = source.indexOf(`const ${name} = (`)
  if (from < 0) return ""
  const to = source.indexOf("\n  )", from)
  return source.slice(from, to)
}

const orderIn = (body: string, parts: readonly string[]) => {
  const positions = parts.map((part) => body.indexOf(part))
  return positions.every((value, index) => value > 0 && (index === 0 || value > positions[index - 1]))
}

console.log("\n[1] / 와 /classes 는 다른 page 다")

check("root page 가 존재한다", exists(HOME_PATH))
check("classes page 가 존재한다", exists(SEARCH_PATH))
check(
  "root 가 classes page 를 re-export 하지 않는다",
  !homeCode.includes('export { default } from "./classes/page"'),
  homeCode.includes("./classes/page") ? "root 가 여전히 classes 를 참조한다" : ""
)
check("root 가 자기 컴포넌트를 렌더한다", homeCode.includes("export default async function ParentHomePage"))
check("classes 가 검색 컴포넌트를 렌더한다", searchCode.includes("export default async function ClassesSearchPage"))
check(
  "두 화면이 같은 조회 맥락을 공유한다(규칙이 두 벌로 갈리지 않는다)",
  homeCode.includes("resolveClassDiscoveryContext") && searchCode.includes("resolveClassDiscoveryContext")
)

console.log("\n[2] view=browse 는 더 이상 없다")

for (const [label, source] of [
  ["home", homeCode],
  ["search", searchCode],
  ["context", contextCode],
  ["nav", navCode]
] as const) {
  check(`${label} 에 view=browse 가 없다`, !source.includes("view=browse") && !source.includes('"browse"'))
}
check("href builder 에 view 가 없다", !stripComments(read("src/features/classes/lib/classes-href.ts")).includes("view"))
check("buildClassesHref() 는 /classes 다", buildClassesHref() === "/classes")
check(
  "buildClassesHref 가 query 계약을 그대로 만든다",
  buildClassesHref({ subjectCategory: "math", q: "영어", sido: "서울" }) ===
    `/classes?subjectCategory=math&q=${encodeURIComponent("영어")}&sido=${encodeURIComponent("서울")}`,
  buildClassesHref({ subjectCategory: "math", q: "영어", sido: "서울" })
)
/*
 * 같은 주소가 화면 링크로도, redirect() 의 Location 헤더로도 쓰인다.
 * 헤더는 ASCII 만 담으므로 한글이 인코딩되지 않으면 500 이 난다(실제로 겪었다).
 */
check(
  "한글 query 가 percent-encoding 된다",
  /^[\x20-\x7e]+$/.test(buildClassesHref({ q: "영어", sido: "서울특별시" })),
  buildClassesHref({ q: "영어", sido: "서울특별시" })
)

console.log("\n[3] Home 은 카탈로그가 아니다")

check("Home 큐레이션 상한이 6 이다", homeCode.includes("const HOME_DISCOVERY_LIMIT = 6"))
check("Home 은 전용 compact card 를 쓴다", homeCode.includes("<HomeClassCard"))
check(
  "Home 에 검색 결과 목록이 없다",
  !homeCode.includes("resultGrid") && !homeCode.includes("<ClassCard")
)
check("Home 에 세부 과목 rail 이 없다", !homeCode.includes("subjectDetailChipRail"))
check("Home 에 '새로 열린 수업' 이 없다", !homeCode.includes("새로 열린 수업"))
check("Home 에 Partner 모집 카드가 없다", !homeCode.includes("파트너 신청하기"))
check("Home 에 marketing footer 가 없다", !homeCode.includes("ParentFooter"))
check("약관 · 사업자 정보는 /my 에 있다", codeOf("app/my/page.tsx").includes("<ParentFooter />"))
check(
  "Home 의 검색은 /classes 로 넘긴다",
  homeCode.includes('targetPathname="/classes"')
)
check(
  "Home 의 과목 shortcut 은 실제 catalog code 를 쓴다",
  homeCode.includes("subjectCategory: category.code") && !homeCode.includes('subjectCategory: "math"')
)
check(
  "Home 의 '전체 보기' 는 /classes 다",
  homeCode.includes("href={buildClassesHref()}")
)
check(
  "Home 에 검색어 · 과목이 붙으면 /classes 로 넘긴다",
  homeCode.includes("if (homeQuery || homeSubjectCategory || homeSubject)")
)

console.log("\n[4] Home 의 두 화면은 render tree 가 다르다")

const discoveryTree = treeBody(homeCode, "discoveryHomeTree")
const conciergeTree = treeBody(homeCode, "conciergeHomeTree")
check("discoveryHomeTree 가 이름 있는 render tree 다", discoveryTree.length > 0)
check("conciergeHomeTree 가 이름 있는 render tree 다", conciergeTree.length > 0)
check(
  "두 화면이 한 줄에서 갈린다",
  homeCode.includes("{hasPersonalizedHome ? conciergeHomeTree : discoveryHomeTree}")
)
check(
  "Discovery Home — 과목 → 배너 → 첫수업 둘러보기",
  orderIn(discoveryTree, ["subjectShortcutSection", "brandBannerSection", "renderHomeDiscoverySection"]),
  discoveryTree.replace(/\s+/g, " ")
)
check(
  "Concierge Home — 지금 확인할 것 → 다가오는 수업 → 개인화 큐레이션 → 과목 → 배너",
  orderIn(conciergeTree, [
    "homeHighlightSection",
    "homeUpcomingSection",
    "renderHomeDiscoverySection",
    "subjectShortcutSection",
    "brandBannerSection"
  ]),
  conciergeTree.replace(/\s+/g, " ")
)
check("두 tree 가 실제로 다르다", discoveryTree.replace(/\s+/g, "") !== conciergeTree.replace(/\s+/g, ""))

/*
 * section 순서를 CSS 로 뒤집지 않는다. order 는 검색 pill 안에서만 허용한다.
 */
const orderedSelectors = [...homeCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .filter(([, , body]) => /(^|[^-\w])order\s*:/.test(body))
  .map(([, selector]) => selector.trim())
/* order 가 허용되는 곳은 검색 pill 내부(입력 · 돋보기 버튼)뿐이다. */
const ORDER_ALLOWED_PREFIXES = [".searchPill", ".searchSubmit"]
check(
  "CSS order 로 section 순서를 뒤집지 않는다",
  orderedSelectors.every((selector) =>
    ORDER_ALLOWED_PREFIXES.some((prefix) => selector.startsWith(prefix))
  ),
  orderedSelectors.join(" | ")
)
check(
  "역방향 flex 로 순서를 뒤집지 않는다",
  !homeCss.includes("column-reverse") && !homeCss.includes("row-reverse")
)

console.log("\n[5] 근거 없는 개인화 문구를 쓰지 않는다")

check(
  "'우리 아이에게 맞는' 은 Concierge Home 에만 있다",
  conciergeTree.includes("우리 아이에게 맞는 첫수업") && !discoveryTree.includes("우리 아이에게 맞는")
)
check("데이터 없는 Home 은 '첫수업 둘러보기' 라고 부른다", homeCode.includes('"첫수업 둘러보기"'))
check("Search 에는 개인화 문구가 없다", !searchCode.includes("우리 아이에게 맞는"))
check(
  "개인화 조회는 Home 에서 학부모로 로그인했을 때만 나간다",
  homeCode.includes("authenticated && isParentUser ? await getParentHomeSummary()") &&
    !searchCode.includes("getParentHomeSummary")
)
check("조회 실패를 '없음' 으로 접지 않는다", queryCode.includes("applications.error") && queryCode.includes("EMPTY_SUMMARY"))

console.log("\n[6] Search 는 Home 것을 들이지 않는다")

for (const [label, needle] of [
  ["브랜드 배너", "hero-banner-bg"],
  ["지금 확인할 것", "지금 확인할 것"],
  ["다가오는 수업", "다가오는 수업"],
  ["홈 큐레이션 카드", "HomeClassCard"],
  ["과목 shortcut 섹션", "과목별 둘러보기"]
] as const) {
  check(`Search 에 ${label} 이(가) 없다`, !searchCode.includes(needle))
}
check("Search 는 검색 · 지역 · 과목 · 세부 과목 · 결과를 갖는다",
  ["<ClassesSearchPill", "<LocationFilter", "과목 대분류", "세부 과목", "resultGrid"].every((part) =>
    searchCode.includes(part)
  )
)
check("Search 는 빈 결과와 오류 상태를 구분한다",
  searchCode.includes("pageEmptyState") && searchCode.includes("stateCard"))
check("Search 는 기존 ClassCard 를 쓴다", searchCode.includes("<ClassCard"))
check(
  "기존 ClassCard 를 깨뜨리지 않았다",
  read("src/features/classes/ui/class-card.tsx").includes("export function ClassCard")
)
check(
  "예약 가능 일정은 Search 결과 카드에 남아 있다",
  searchCode.includes("getPublicClassCardScheduleSummaries") && searchCode.includes("scheduleLabel=")
)

console.log("\n[7] 하단 탭")

/* 탭 구성 · active 규칙 자체는 verify-parent-nav 가 본다. 여기서는 공용 nav 사용만 본다. */
for (const [label, path] of [
  ["home", HOME_PATH],
  ["search", SEARCH_PATH],
  ["record", "app/record/page.tsx"],
  ["my", "app/my/page.tsx"],
  ["favorites", "app/favorites/favorites-client.tsx"]
] as const) {
  check(`${label} 화면이 공용 ParentBottomNav 를 쓴다`, codeOf(path).includes("<ParentBottomNav"))
}
check(
  "화면별 nav component 를 다시 만들지 않았다",
  !homeCode.includes('aria-label="하단 탭"') && !searchCode.includes('aria-label="하단 탭"')
)

console.log("\n[8] canonical")

check('/ 의 canonical 은 "/" 다', homeCode.includes('canonical: "/"'))
check('/classes 의 canonical 은 "/classes" 다', searchCode.includes('canonical: "/classes"'))
check("두 canonical 이 서로 다르다", !searchCode.includes('canonical: "/"\n'))
check(
  "query canonicalization 은 그대로다",
  contextCode.includes("canonicalizeRegionSelection") &&
    contextCode.includes("resolveSubjectQuerySelection") &&
    contextCode.includes("shouldCanonicalize") &&
    homeCode.includes("context.shouldCanonicalize") &&
    searchCode.includes("context.shouldCanonicalize")
)

console.log("\n[9] query 계약")

for (const key of ["subjectCategory", "subject", "q", "radius", "sido", "sigungu", "bname"]) {
  check(`${key} query 가 그대로 있다`, contextCode.includes(key))
}
check("상세 링크는 /classes/[id] 그대로다", searchCode.includes("`/classes/${classId}`"))
check("legacy region query 는 제거만 한다", contextCode.includes("hasLegacyRegionQuery"))

console.log("\n[10] 삭제 금지 route")

for (const route of [
  "app/favorites/page.tsx",
  "app/academies/page.tsx",
  "app/academy/[handle]",
  "app/record/page.tsx",
  "app/my/page.tsx",
  "app/partner",
  "app/(legal)",
  "app/classes/[id]/page.tsx",
  "app/classes/[id]/apply/page.tsx"
]) {
  check(`${route} 가 남아 있다`, exists(route))
}

console.log("\n[11] 가짜 개인화 지표를 만들지 않는다")

const FORBIDDEN = ["일치율", "% 일치", "BEST", "AI 추천", "추천 점수", "랭킹", "적합도", "매칭 점수"]
for (const term of FORBIDDEN) {
  check(`"${term}" 을 쓰지 않는다`, !homeCode.includes(term) && !searchCode.includes(term) && !libCode.includes(term))
}
check("별점 · 리뷰 수를 그리지 않는다", !/★|평점|rating|reviewCount/i.test(homeCode + searchCode))
check("홈 CSS 에 별점 스타일이 없다", !/★|\bstars?\b|\brating\b/i.test(homeCss))
check("lib 이 점수 · 순위를 계산하지 않는다", !/score|rank|percent/i.test(libCode))

const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }
const ICON_PACKAGES = ["lucide-react", "react-icons", "@heroicons/react", "@tabler/icons-react", "phosphor-react"]
check("아이콘 package 를 설치하지 않았다", ICON_PACKAGES.every((name) => !(name in deps)))
check(
  "emoji 를 production icon 으로 쓰지 않는다",
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(homeCode + searchCode)
)
check(
  "홈 개인화가 새 adapter method 를 요구하지 않는다",
  !adapter.includes("ParentHome") && !adapter.includes("parentHome")
)
check(
  "조회는 기존 것만 조립한다",
  queryCode.includes("getMyApplications") &&
    queryCode.includes("getMyChildren") &&
    queryCode.includes("getParentActions") &&
    contextCode.includes("getPublicClasses")
)

console.log("\n[12] 일정 · 아이 · 개인화 목록 규칙")

check(
  "UTC 04:00 → 9월 15일 오후 1시",
  formatHomeScheduleLabel("2026-09-15T04:00:00.000Z") === "9월 15일 오후 1시"
)
check(
  "UTC 15:30(전날) → 9월 16일 오전 12시 30분",
  formatHomeScheduleLabel("2026-09-15T15:30:00.000Z") === "9월 16일 오전 12시 30분"
)
check("정오는 오후 12시다", formatHomeScheduleLabel("2026-09-15T03:00:00.000Z") === "9월 15일 오후 12시")
check("깨진 값은 라벨이 없다", formatHomeScheduleLabel("어제") === null)

check("아이가 없으면 칩도 없다", formatChildChipLabel([]) === null)
check("아이가 하나면 학년 + 이름", formatChildChipLabel([child({ id: "c1" })]) === "초6 김사랑")
const twoChildren = formatChildChipLabel([child({ id: "c1" }), child({ id: "c2", name: "김하늘" })])
check("아이가 여럿이면 인원수만", twoChildren === "우리 아이 2명", String(twoChildren))
check(
  "아이가 여럿일 때 한 명의 이름을 쓰지 않는다",
  !String(twoChildren).includes("김사랑") && !String(twoChildren).includes("김하늘")
)

const now = Date.parse("2026-09-15T00:00:00.000Z")
const upcoming = selectUpcomingExperiences(
  [
    application({ id: "confirmed-late", status: "confirmed", confirmedSlotAt: "2026-09-20T01:00:00.000Z" }),
    application({ id: "confirmed-soon", status: "confirmed", confirmedSlotAt: "2026-09-16T01:00:00.000Z" }),
    application({ id: "confirmed-past", status: "confirmed", confirmedSlotAt: "2026-09-10T01:00:00.000Z" }),
    application({
      id: "confirmed-canceled",
      status: "confirmed",
      confirmedSlotAt: "2026-09-17T01:00:00.000Z",
      canceledAt: "2026-09-12T01:00:00.000Z"
    }),
    application({ id: "requested-only", status: "new", confirmedSlotAt: null }),
    application({ id: "confirmed-third", status: "confirmed", confirmedSlotAt: "2026-09-18T01:00:00.000Z" })
  ],
  now
)
check(
  "다가오는 일정은 확정된 것만, 빠른 순, 최대 2건",
  upcoming.map((item) => item.id).join(",") === "confirmed-soon,confirmed-third" &&
    upcoming.length <= PARENT_HOME_UPCOMING_LIMIT,
  upcoming.map((item) => item.id).join(",")
)
check("lib 은 requestedSlotAt 을 일정으로 읽지 않는다", !libCode.includes("requestedSlotAt"))

/* Action(지금 확인해야 할 것) 판정은 verify-parent-actions 가 본다. */
check(
  "Home 이 Action 판정을 다시 쓰지 않는다",
  queryCode.includes("getParentActions()") && !queryCode.includes("getPublishedExperienceReport")
)
check(
  "Home 은 앞의 몇 개만 미리 보여 준다",
  queryCode.includes("allActions.slice(0, PARENT_ACTION_PREVIEW_LIMIT)") &&
    queryCode.includes("hasMoreActions")
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
