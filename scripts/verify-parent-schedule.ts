// 학부모 일정(/my/schedule)의 계약 검증.
//
//   npx tsx scripts/verify-parent-schedule.ts
//
// 여기서 고정하는 것.
//   1. "예정" 은 학원이 확정한 일정뿐이다 — requestedSlotAt 을 일정으로 쓰지 않는다.
//   2. completed · canceled · 지난 일정은 예정 목록에 오지 않는다.
//   3. Home 의 "다가오는 수업" 과 /my/schedule 이 같은 판정 함수를 쓴다.
//   4. 날짜는 한국 시간으로 읽는다. 문자열을 잘라 쓰지 않는다.
//   5. 오늘/내일은 날짜로 판단한다(24시간 계산이 아니다).
//   6. 로그인이 필요하고, 비로그인은 returnTo 를 달고 돌아온다.
//   7. 자녀가 한 명이면 필터 UI 를 만들지 않고, URL 로 남의 아이를 지목할 수 없다.
//   8. 조회 실패와 "일정 없음" 을 구분한다.
//   9. 카드가 실제 값만 그린다(가짜 상태 · 장소 · 시간 없음).
//  10. /my/applications 를 지우거나 redirect 하지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  formatScheduleChildLabel,
  formatScheduleDateLabel,
  formatScheduleTimeLabel,
  groupParentScheduleByDay,
  isUpcomingConfirmedExperience,
  selectUpcomingConfirmedExperiences,
  toParentScheduleItems
} from "@/features/schedule/lib/parent-schedule"
import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"
import type { ChildProfile, ParentApplicationSummary } from "@/shared/lib/db/adapter"

const PAGE_PATH = "app/my/schedule/page.tsx"
const LIB_PATH = "src/features/schedule/lib/parent-schedule.ts"
const HOME_LIB_PATH = "src/features/classes/lib/parent-home.ts"
const HOME_PATH = "app/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const page = codeOf(PAGE_PATH)
const lib = stripComments(read(LIB_PATH))
const homeLib = stripComments(read(HOME_LIB_PATH))
const home = codeOf(HOME_PATH)

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
  requestedSlotAt: "2026-09-20T01:00:00.000Z",
  requestedScheduleBlockId: null,
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

const NOW_ISO = "2026-09-16T00:00:00.000Z" // 한국시간 9/16 09:00
const now = new Date(NOW_ISO)

console.log("\n[1] 예정은 확정된 일정뿐이다")

const pool = [
  application({ id: "confirmed-soon", status: "confirmed", confirmedSlotAt: "2026-09-16T06:00:00.000Z" }),
  application({ id: "confirmed-later", status: "confirmed", confirmedSlotAt: "2026-09-18T06:00:00.000Z" }),
  application({ id: "confirmed-past", status: "confirmed", confirmedSlotAt: "2026-09-10T06:00:00.000Z" }),
  application({
    id: "confirmed-completed",
    status: "completed",
    confirmedSlotAt: "2026-09-19T06:00:00.000Z",
    completedAt: "2026-09-19T08:00:00.000Z"
  }),
  application({
    id: "confirmed-canceled",
    status: "confirmed",
    confirmedSlotAt: "2026-09-19T06:00:00.000Z",
    canceledAt: "2026-09-12T00:00:00.000Z"
  }),
  application({ id: "requested-only", status: "new", requestedSlotAt: "2026-09-17T06:00:00.000Z" }),
  application({ id: "reviewing", status: "reviewing", requestedSlotAt: "2026-09-17T07:00:00.000Z" }),
  application({ id: "confirmed-no-slot", status: "confirmed", confirmedSlotAt: null })
]
const upcoming = selectUpcomingConfirmedExperiences(pool, now.getTime())
const upcomingIds = upcoming.map((item) => item.id)

check("빠른 순으로 정렬된다", upcomingIds.join(",") === "confirmed-soon,confirmed-later", upcomingIds.join(","))
check("지난 확정 일정은 빠진다", !upcomingIds.includes("confirmed-past"))
check("완료된 경험은 빠진다", !upcomingIds.includes("confirmed-completed"))
check("취소된 신청은 빠진다", !upcomingIds.includes("confirmed-canceled"))
check(
  "희망 시각만 있는 신청(new · reviewing)은 일정이 아니다",
  !upcomingIds.includes("requested-only") && !upcomingIds.includes("reviewing")
)
check("확정 시각이 없으면 빠진다", !upcomingIds.includes("confirmed-no-slot"))
check(
  "판정 함수 하나로 끝난다",
  isUpcomingConfirmedExperience(pool[0], now.getTime()) &&
    !isUpcomingConfirmedExperience(pool[5], now.getTime())
)
check("limit 을 주면 그만큼만 자른다", selectUpcomingConfirmedExperiences(pool, now.getTime(), 1).length === 1)
check("lib 이 requestedSlotAt 을 읽지 않는다", !lib.includes("requestedSlotAt"))

console.log("\n[2] Home 과 같은 규칙을 쓴다")

check(
  "Home 이 판정 규칙을 다시 쓰지 않는다",
  homeLib.includes("selectUpcomingConfirmedExperiences") &&
    !homeLib.includes('item.status !== "confirmed"')
)
check("일정 화면도 같은 함수를 쓴다", page.includes("selectUpcomingConfirmedExperiences"))

console.log("\n[3] 날짜 · 시간은 한국 시간으로 읽는다")

check("KST helper 를 쓴다", lib.includes("getSeoulDateTimeParts") && lib.includes("formatSeoulDateKey"))
check(
  "문자열을 잘라 쓰지 않는다",
  !lib.includes(".slice(0, 10)") && !lib.includes(".split(\"T\")")
)
// 2026-09-18T06:00:00Z = 한국시간 9/18(금) 15:00
check(
  "9월 18일 금요일",
  formatScheduleDateLabel("2026-09-18T06:00:00.000Z") === "9월 18일 금요일",
  String(formatScheduleDateLabel("2026-09-18T06:00:00.000Z"))
)
check(
  "오후 3:00",
  formatScheduleTimeLabel("2026-09-18T06:00:00.000Z") === "오후 3:00",
  String(formatScheduleTimeLabel("2026-09-18T06:00:00.000Z"))
)
check("정오는 오후 12:00", formatScheduleTimeLabel("2026-09-18T03:00:00.000Z") === "오후 12:00")
check("자정은 오전 12:05", formatScheduleTimeLabel("2026-09-17T15:05:00.000Z") === "오전 12:05")
check("깨진 값은 라벨이 없다", formatScheduleDateLabel("어제") === null && formatScheduleTimeLabel("어제") === null)

console.log("\n[4] 오늘 · 내일은 날짜로 판단한다")

const groups = groupParentScheduleByDay(toParentScheduleItems(upcoming), now)
check("날짜별로 묶인다", groups.length === 2, groups.map((group) => group.dateKey).join(","))
check("날짜 순이다", groups[0].dateKey < groups[1].dateKey)
check("오늘은 오늘이라고 부른다", groups[0].relativeLabel === "오늘", String(groups[0].relativeLabel))
check("모레는 보조 표현이 없다", groups[1].relativeLabel === null, String(groups[1].relativeLabel))

// 한국시간 9/16 23:30 과 9/17 00:30 은 한 시간 차이지만 다른 날이다.
const nightItems = toParentScheduleItems([
  application({ id: "tonight", status: "confirmed", confirmedSlotAt: "2026-09-16T14:30:00.000Z" }),
  application({ id: "after-midnight", status: "confirmed", confirmedSlotAt: "2026-09-16T15:30:00.000Z" })
])
const nightGroups = groupParentScheduleByDay(nightItems, now)
check(
  "자정을 넘기면 다른 날이다",
  nightGroups.length === 2 &&
    nightGroups[0].relativeLabel === "오늘" &&
    nightGroups[1].relativeLabel === "내일",
  nightGroups.map((group) => `${group.dateKey}:${group.relativeLabel}`).join(" ")
)

console.log("\n[5] 화면 모델")

const [item] = toParentScheduleItems([
  application({ id: "one", status: "confirmed", confirmedSlotAt: "2026-09-18T06:00:00.000Z" })
])
check("경험 상세로 돌아간다", item.href === "/record/one", item.href)
check("자녀 · 수업 · 학원 · 유형을 싣는다",
  item.childName === "김사랑" &&
    item.childGrade === "초6" &&
    item.classTitle === "영어 레벨테스트" &&
    item.academyName === "미래학당 일산본원" &&
    item.programType === "level_test"
)
check(
  "읽히지 않는 시각은 항목을 만들지 않는다",
  toParentScheduleItems([application({ id: "broken", status: "confirmed", confirmedSlotAt: "어제" })]).length === 0
)
check("자녀 칩 라벨은 실제 값이다", formatScheduleChildLabel(child({ id: "c1" })) === "김사랑 · 초6")
check("학년이 비면 이름만", formatScheduleChildLabel(child({ id: "c1", grade: "  " })) === "김사랑")

console.log("\n[6] 화면 계약")

check("route 가 있다", exists(PAGE_PATH))
check(
  "로그인 정책은 기존 것을 쓴다",
  page.includes('requireParentAccess({ returnTo: "/my/schedule" })')
)
check("기존 parent-safe 조회를 쓴다", page.includes("getMyApplications()") && page.includes("getMyChildren()"))
check("새 adapter method 를 만들지 않았다", !page.includes("dataAdapter."))
check(
  "자녀가 하나면 필터를 만들지 않는다",
  page.includes("const hasMultipleChildren = children.data.length > 1") &&
    page.includes("{hasMultipleChildren ? (")
)
check(
  "URL 로 남의 아이를 지목할 수 없다",
  page.includes("children.data.some((child) => child.id === requestedChildId)")
)
check(
  "조회 실패와 일정 없음이 다른 분기다",
  page.includes("{applications.error ? (") && page.includes("totalCount === 0 ? (")
)
check("실패 문구가 따로 있다", page.includes("일정을 불러오지 못했어요.") && page.includes("다시 시도해 주세요."))
check("빈 상태 문구가 따로 있다", page.includes("예정된 첫수업이 없어요."))
check("빈 상태 CTA 는 홈이다", page.includes('<Link href="/" className={styles.primaryButton}>'))
check("공용 nav 를 쓴다", page.includes("<ParentBottomNav />"))
check("일정 탭이 active 다", resolveParentNavTab("/my/schedule") === "schedule")
check("자녀 필터를 걸어도 일정 탭이다", resolveParentNavTab("/my/schedule?child=x".split("?")[0]) === "schedule")
check(
  "가짜 상태 · 장소를 만들지 않는다",
  !page.includes("예정 장소") && !page.includes("미정") && !/rating|★/i.test(page)
)

console.log("\n[7] Home 연동 · 기존 route 보존")

check(
  'Home 일정 탭은 /my/schedule 이다',
  home.includes('scheduleHref={scheduleEntryHref}') && home.includes('"/my/schedule"')
)
check("Home 카드는 경험 상세로 그대로 간다", home.includes("href={upcoming.href}"))
check("/my/applications 가 남아 있다", exists("app/my/applications/page.tsx"))
check(
  "/my/applications 를 redirect 하지 않았다",
  !codeOf("app/my/applications/page.tsx").includes('redirect("/my/schedule")')
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
