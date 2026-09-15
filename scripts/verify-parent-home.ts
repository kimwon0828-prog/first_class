// Parent Home(/classes) 재디자인의 계약 검증.
//
//   npx tsx scripts/verify-parent-home.ts
//
// 여기서 고정하는 것.
//   1. 홈은 가짜 개인화 지표를 만들지 않는다 — 일치율 · 별점 · 점수 · 랭킹 · BEST.
//   2. "다가오는 수업 일정" 은 확정된 일정만이다. 희망 시각을 확정처럼 쓰지 않는다.
//   3. 개인화 영역은 보여줄 것이 있을 때만 그린다. 빈 섹션을 남기지 않는다.
//   4. 개인화 조회는 학부모로 로그인했을 때만 나간다 — /classes 는 공개 화면이다.
//   5. 하단 탭은 네 개다: 홈 · 관심수업 · 기록 · 마이페이지. 학부모 화면 전체가 같다.
//   6. 아이 칩은 아이가 여럿일 때 한 명을 대표로 고르지 않는다.
//   7. 날짜는 한국 시간으로 읽는다.
//   8. 새 package 를 쓰지 않고, emoji 를 production icon 으로 쓰지 않는다.
//   9. 검색 · 과목 · 지역 query parameter 계약을 그대로 둔다.
//  10. adapter 에 새 method 를 만들지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  PARENT_HOME_HIGHLIGHT_LIMIT,
  PARENT_HOME_REPORT_LOOKUP_LIMIT,
  PARENT_HOME_UPCOMING_LIMIT,
  buildParentHomeHighlights,
  formatChildChipLabel,
  formatHomeScheduleLabel,
  selectReportLookupCandidates,
  selectUpcomingExperiences
} from "@/features/classes/lib/parent-home"
import type { ChildProfile, ParentApplicationSummary } from "@/shared/lib/db/adapter"

const PAGE_PATH = "app/classes/page.tsx"
const PAGE_CSS_PATH = "app/classes/page.module.css"
const LIB_PATH = "src/features/classes/lib/parent-home.ts"
const QUERY_PATH = "src/features/classes/queries/get-parent-home-summary.ts"
const NAV_PATH = "app/classes/classes-bottom-nav.tsx"
const RECORD_NAV_PATH = "src/features/record/ui/record-bottom-nav.tsx"
const FAVORITES_NAV_PATH = "app/favorites/favorites-client.tsx"
const MY_NAV_PATH = "app/my/page.tsx"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"
const PACKAGE_PATH = "package.json"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // URL 안의 "//" 를 줄 주석으로 오해하지 않는다(F1 에서 같은 오탐을 겪었다).
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")

const page = read(PAGE_PATH)
const pageCode = stripComments(stripJsxComments(page))
// CSS 주석도 걷어낸다. "쓰지 않는다" 고 적어 둔 설명문이 위반처럼 잡히지 않도록.
const pageCss = stripComments(read(PAGE_CSS_PATH))
const libCode = stripComments(read(LIB_PATH))
const queryCode = stripComments(read(QUERY_PATH))
const navCode = stripComments(read(NAV_PATH))
const recordNavCode = stripComments(read(RECORD_NAV_PATH))
const favoritesNavCode = stripComments(read(FAVORITES_NAV_PATH))
const myNavCode = stripComments(read(MY_NAV_PATH))
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

console.log("\n[1] 일정 표기는 한국 시간이다")

// 2026-09-15T04:00:00Z = 한국시간 13:00
check(
  "UTC 04:00 → 9월 15일 오후 1시",
  formatHomeScheduleLabel("2026-09-15T04:00:00.000Z") === "9월 15일 오후 1시",
  String(formatHomeScheduleLabel("2026-09-15T04:00:00.000Z"))
)
// 한국시간 자정 직후. UTC 로 읽으면 하루 전이 된다.
check(
  "UTC 15:30(전날) → 9월 16일 오전 12시 30분",
  formatHomeScheduleLabel("2026-09-15T15:30:00.000Z") === "9월 16일 오전 12시 30분",
  String(formatHomeScheduleLabel("2026-09-15T15:30:00.000Z"))
)
check(
  "정오는 오후 12시다",
  formatHomeScheduleLabel("2026-09-15T03:00:00.000Z") === "9월 15일 오후 12시",
  String(formatHomeScheduleLabel("2026-09-15T03:00:00.000Z"))
)
check("null 은 라벨이 없다", formatHomeScheduleLabel(null) === null)
check("깨진 값은 라벨이 없다", formatHomeScheduleLabel("어제") === null)

console.log("\n[2] 아이 칩은 대표를 임의로 고르지 않는다")

check("아이가 없으면 칩도 없다", formatChildChipLabel([]) === null)
check(
  "아이가 하나면 학년 + 이름",
  formatChildChipLabel([child({ id: "c1" })]) === "초6 김사랑"
)
check(
  "학년이 비어 있으면 이름만",
  formatChildChipLabel([child({ id: "c1", grade: "  " })]) === "김사랑"
)
const twoChildren = formatChildChipLabel([
  child({ id: "c1", name: "김사랑" }),
  child({ id: "c2", name: "김하늘" })
])
check("아이가 여럿이면 인원수만", twoChildren === "우리 아이 2명", String(twoChildren))
check(
  "아이가 여럿일 때 한 명의 이름을 쓰지 않는다",
  !String(twoChildren).includes("김사랑") && !String(twoChildren).includes("김하늘")
)

console.log("\n[3] 다가오는 일정은 확정된 것만이다")

const now = Date.parse("2026-09-15T00:00:00.000Z")
const upcomingPool = [
  application({
    id: "confirmed-late",
    status: "confirmed",
    confirmedSlotAt: "2026-09-20T01:00:00.000Z"
  }),
  application({
    id: "confirmed-soon",
    status: "confirmed",
    confirmedSlotAt: "2026-09-16T01:00:00.000Z"
  }),
  application({
    id: "confirmed-past",
    status: "confirmed",
    confirmedSlotAt: "2026-09-10T01:00:00.000Z"
  }),
  application({
    id: "confirmed-canceled",
    status: "confirmed",
    confirmedSlotAt: "2026-09-17T01:00:00.000Z",
    canceledAt: "2026-09-12T01:00:00.000Z"
  }),
  application({
    id: "requested-only",
    status: "new",
    requestedSlotAt: "2026-09-16T01:00:00.000Z",
    confirmedSlotAt: null
  }),
  application({
    id: "reviewing",
    status: "reviewing",
    requestedSlotAt: "2026-09-16T02:00:00.000Z",
    confirmedSlotAt: null
  }),
  application({
    id: "confirmed-third",
    status: "confirmed",
    confirmedSlotAt: "2026-09-18T01:00:00.000Z"
  })
]
const upcoming = selectUpcomingExperiences(upcomingPool, now)
check(
  "빠른 순으로 정렬된다",
  upcoming.map((item) => item.id).join(",") === "confirmed-soon,confirmed-third",
  upcoming.map((item) => item.id).join(",")
)
check("상한은 2건이다", upcoming.length <= PARENT_HOME_UPCOMING_LIMIT)
const upcomingIds = new Set(upcoming.map((item) => item.id))
check("지난 일정은 오지 않는다", !upcomingIds.has("confirmed-past"))
check("취소된 신청은 오지 않는다", !upcomingIds.has("confirmed-canceled"))
check(
  "희망 시각만 있는 신청(new · reviewing)은 일정이 아니다",
  !upcomingIds.has("requested-only") && !upcomingIds.has("reviewing")
)
check(
  "확정 시각이 없으면 오지 않는다",
  selectUpcomingExperiences(
    [application({ id: "no-slot", status: "confirmed", confirmedSlotAt: null })],
    now
  ).length === 0
)
check(
  "lib 은 requestedSlotAt 을 일정으로 읽지 않는다",
  !libCode.includes("requestedSlotAt")
)

console.log("\n[4] 리포트 확인 대상은 완료된 경험뿐이다")

const reportPool = [
  application({ id: "done-old", status: "completed", completedAt: "2026-09-01T00:00:00.000Z" }),
  application({ id: "done-new", status: "completed", completedAt: "2026-09-12T00:00:00.000Z" }),
  application({ id: "done-mid", status: "completed", completedAt: "2026-09-08T00:00:00.000Z" }),
  application({ id: "done-oldest", status: "completed", completedAt: "2026-08-01T00:00:00.000Z" }),
  application({ id: "open", status: "confirmed", confirmedSlotAt: "2026-09-20T01:00:00.000Z" }),
  application({
    id: "done-canceled",
    status: "completed",
    completedAt: "2026-09-13T00:00:00.000Z",
    canceledAt: "2026-09-13T01:00:00.000Z"
  })
]
const candidates = selectReportLookupCandidates(reportPool)
check(
  "최근 완료 순으로 최대 3건",
  candidates.map((item) => item.id).join(",") === "done-new,done-mid,done-old",
  candidates.map((item) => item.id).join(",")
)
check("상한은 3건이다", candidates.length <= PARENT_HOME_REPORT_LOOKUP_LIMIT)
check(
  "완료되지 않았거나 취소된 신청은 후보가 아니다",
  !candidates.some((item) => item.id === "open" || item.id === "done-canceled")
)

console.log("\n[5] 지금 확인할 것")

const highlightPool = [
  application({ id: "ask-1", status: "completed", canCollectParentDecision: true }),
  application({ id: "report-1", status: "completed", canCollectParentDecision: true }),
  application({ id: "ask-2", status: "completed", canCollectParentDecision: true }),
  application({
    id: "canceled-report",
    status: "completed",
    canCollectParentDecision: true,
    canceledAt: "2026-09-13T00:00:00.000Z"
  }),
  application({ id: "quiet", status: "completed", canCollectParentDecision: false })
]
const highlights = buildParentHomeHighlights(
  highlightPool,
  new Set(["report-1", "canceled-report"])
)
check(
  "리포트가 먼저다",
  highlights[0]?.kind === "report_ready" && highlights[0]?.experienceId === "report-1",
  JSON.stringify(highlights.map((item) => [item.kind, item.experienceId]))
)
check(
  "리포트가 온 경험은 결정 요청으로 중복되지 않는다",
  highlights.filter((item) => item.experienceId === "report-1").length === 1
)
check(
  "취소된 신청은 아무 줄도 만들지 않는다",
  !highlights.some((item) => item.experienceId === "canceled-report")
)
check(
  "물어볼 것이 없는 경험은 줄을 만들지 않는다",
  !highlights.some((item) => item.experienceId === "quiet")
)
check("상한은 3줄이다", highlights.length <= PARENT_HOME_HIGHLIGHT_LIMIT)
check(
  "모든 줄이 자기 경험으로 돌아간다",
  highlights.every((item) => item.href.includes(item.experienceId))
)
check(
  "보여줄 것이 없으면 빈 배열이다",
  buildParentHomeHighlights([], new Set()).length === 0
)
check(
  "리포트 줄은 리포트 화면으로 간다",
  highlights
    .filter((item) => item.kind === "report_ready")
    .every((item) => item.href.endsWith("/report"))
)

console.log("\n[6] 가짜 개인화 지표를 만들지 않는다")

const FORBIDDEN = ["일치율", "% 일치", "BEST", "AI 추천", "추천 점수", "랭킹", "적합도", "매칭 점수"]
for (const term of FORBIDDEN) {
  check(`홈이 "${term}" 을 쓰지 않는다`, !pageCode.includes(term) && !libCode.includes(term))
}
check("별점 · 리뷰 수를 그리지 않는다", !/★|평점|rating|reviewCount/i.test(pageCode))
// "start"(scroll-snap-align) 가 "star" 로 잡히지 않도록 단어 경계를 쓴다.
check("홈 CSS 에 별점 스타일이 없다", !/★|\bstars?\b|\brating\b/i.test(pageCss))
check(
  "lib 이 점수 · 순위를 계산하지 않는다",
  !/score|rank|percent/i.test(libCode)
)

console.log("\n[7] 개인화 영역은 있을 때만 그린다")

check(
  "highlights 섹션은 개수로 열린다",
  pageCode.includes("parentHome.highlights.length > 0")
)
check(
  "upcoming 섹션은 개수로 열린다",
  pageCode.includes("parentHome.upcoming.length > 0")
)
check(
  "두 섹션 모두 조건부로만 렌더된다",
  pageCode.includes("hasHighlightSection && parentHome") &&
    pageCode.includes("hasUpcomingSection && parentHome")
)
check(
  "개인화 조회는 학부모 로그인일 때만 나간다",
  pageCode.includes("authenticated && isParentUser ? await getParentHomeSummary()")
)
check(
  "조회 실패를 '없음' 으로 접지 않는다",
  queryCode.includes("applications.error") && queryCode.includes("EMPTY_SUMMARY")
)

console.log("\n[8] 하단 탭은 네 개다")

const TABS = ["홈", "관심수업", "기록", "마이페이지"]
for (const [label, source] of [
  ["classes", navCode],
  ["record", recordNavCode],
  ["favorites", favoritesNavCode],
  ["my", myNavCode]
] as const) {
  check(
    `${label} 화면의 탭이 홈 · 관심수업 · 기록 · 마이페이지다`,
    TABS.every((tab) => source.includes(`>${tab}<`) || source.includes(`"${tab}"`)),
    TABS.filter((tab) => !(source.includes(`>${tab}<`) || source.includes(`"${tab}"`))).join(",")
  )
  check(`${label} 화면에 "내 신청" 탭이 남아 있지 않다`, !source.includes("내 신청"))
}
check("탭 대상이 모두 기존 route 다", ["/favorites", "/record", "/my"].every((href) => navCode.includes(href)))

console.log("\n[9] query parameter 계약과 route 를 그대로 둔다")

for (const key of ["subjectCategory", "subject", "q", "radius", "sido", "sigungu", "bname"]) {
  check(`${key} query 가 그대로 있다`, pageCode.includes(key))
}
check("canonical 은 여전히 '/' 다", pageCode.includes('canonical: "/"'))
check("상세 링크는 /classes/[id] 그대로다", pageCode.includes("`/classes/${classId}`"))
check("지역 검색 진입점(LocationFilter)이 살아 있다", pageCode.includes("<LocationFilter"))

console.log("\n[10] 새 package · adapter method 를 만들지 않는다")

const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }
const ICON_PACKAGES = ["lucide-react", "react-icons", "@heroicons/react", "@tabler/icons-react", "phosphor-react"]
check(
  "아이콘 package 를 설치하지 않았다",
  ICON_PACKAGES.every((name) => !(name in deps)),
  ICON_PACKAGES.filter((name) => name in deps).join(",")
)
check(
  "emoji 를 production icon 으로 쓰지 않는다",
  !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(pageCode)
)
check(
  "홈 개인화가 새 adapter method 를 요구하지 않는다",
  !adapter.includes("ParentHome") && !adapter.includes("parentHome")
)
check(
  "query 는 기존 조회만 조립한다",
  queryCode.includes("getMyApplications") &&
    queryCode.includes("getMyChildren") &&
    queryCode.includes("getPublishedExperienceReport") &&
    queryCode.includes("getPublicClassDetail")
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
