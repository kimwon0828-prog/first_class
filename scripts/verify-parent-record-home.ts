// 교육 기록 Home(/record) 의 계약 검증.
//
//   npx tsx scripts/verify-parent-record-home.ts
//
// 여기서 고정하는 것.
//   1. 목록은 completed Experience 뿐이다(Phase 6.2 계약 유지).
//   2. 신청 목록도, 처리 타임라인도 아니다 — 단계 · 상태 용어를 쓰지 않는다.
//   3. 자녀가 하나면 필터를 만들지 않고, URL 로 남의 아이를 지목할 수 없다.
//   4. 교육 프로필 진입점이 경험 카드와 구분된다.
//   5. 카드는 실제로 있는 값만 그린다 — 점수 · 별점 · 순위 · 그래프 없음.
//   6. 리포트 · 내 생각 신호는 실제 조회 결과만 쓰고, 부정 배지를 만들지 않는다.
//      조회에 실패하면 신호 자체를 숨긴다.
//   7. 날짜는 한국 시간으로 읽고, 기존 canonical date helper 를 쓴다.
//   8. empty 와 error 가 다른 분기다.
//   9. /record 는 기록 탭이고, 상세 · 리포트 · 프로필 route 를 건드리지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { selectCompletedExperiences } from "@/features/applications/lib/parent-application-split"
import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"
import { resolveParentExperienceDate } from "@/features/record/lib/experience-view"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

const PAGE_PATH = "app/record/page.tsx"
const PAGE_CSS_PATH = "app/record/page.module.css"
const LIST_PATH = "src/features/record/ui/record-experience-list.tsx"
const LIST_CSS_PATH = "src/features/record/ui/record-experience-list.module.css"
const SIGNALS_PATH = "src/features/record/queries/get-parent-experience-signals.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const page = codeOf(PAGE_PATH)
const pageCss = stripComments(read(PAGE_CSS_PATH))
const list = codeOf(LIST_PATH)
const listCss = stripComments(read(LIST_CSS_PATH))
const signals = stripComments(read(SIGNALS_PATH))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const application = (
  overrides: Partial<ParentApplicationSummary> & { id: string }
): ParentApplicationSummary => ({
  classId: "class-1",
  classTitle: "파이썬 체험",
  classProgramType: "trial_class",
  academyName: "씨큐브코딩 중계센터",
  organizationAddress: null,
  organizationAddressDetail: null,
  childId: "child-1",
  childName: "김사랑",
  childGrade: "초6",
  requestedSlotAt: "2026-09-10T01:00:00.000Z",
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

console.log("\n[1] 목록은 completed 뿐이다")

const POOL = [
  application({ id: "new-1", status: "new" }),
  application({ id: "reviewing-1", status: "reviewing" }),
  application({ id: "confirmed-1", status: "confirmed", confirmedSlotAt: "2026-09-30T01:00:00.000Z" }),
  application({ id: "canceled-1", status: "canceled", canceledAt: "2026-09-05T00:00:00.000Z" }),
  application({
    id: "done-old",
    status: "completed",
    confirmedSlotAt: "2026-08-12T04:00:00.000Z",
    completedAt: "2026-08-12T06:00:00.000Z"
  }),
  application({
    id: "done-new",
    status: "completed",
    confirmedSlotAt: "2026-09-12T04:00:00.000Z",
    completedAt: "2026-09-12T06:00:00.000Z"
  })
]
const listed = selectCompletedExperiences(POOL).map((item) => item.id)

check("A) completed 만 남는다", listed.join(",") === "done-new,done-old", listed.join(","))
check(
  "B) new · reviewing · confirmed · canceled 는 0건이다",
  ["new-1", "reviewing-1", "confirmed-1", "canceled-1"].every((id) => !listed.includes(id))
)
check("페이지가 그 규칙 하나를 쓴다", page.includes("selectCompletedExperiences(applications.data)"))

console.log("\n[2] 신청 목록 · 처리 타임라인이 아니다")

for (const term of ["신청 내역", "처리 현황", "진행 상태", "단계", "타임라인"]) {
  check(`"${term}" 을 쓰지 않는다`, !page.includes(term) && !list.includes(term))
}
check(
  "단계 라벨 helper 를 쓰지 않는다",
  !list.includes("getExperienceStageLabel") && !list.includes("resolveExperienceStage")
)
check("헤더 문구가 경험을 말한다", page.includes("우리 아이가 경험한 첫수업을 모아볼 수 있어요."))
check("섹션 제목이 있다", page.includes("지금까지의 첫수업"))
check("통계 · 그래프를 만들지 않는다", !page.includes("chart") && !page.includes("그래프") && !pageCss.includes("chart"))

console.log("\n[3] 자녀 필터")

check("자녀가 여럿일 때만 필터를 만든다", page.includes("{hasMultipleChildren ? ("))
check("기존 ?child= 계약을 쓴다", page.includes("`/record?child=${child.id}`"))
check(
  "내 자녀가 아닌 id 는 적용하지 않는다",
  page.includes("children.data.some((child) => child.id === requestedChildId)")
)
check("전체 칩이 있다", page.includes('<Link\n              href="/record"'))

console.log("\n[4] 교육 프로필 진입점")

check("D) /record/profile 로 간다", page.includes("`/record/profile?child=${profileChild.id}`"))
check("아이가 정해졌을 때만 보인다", page.includes("{profileChild ? ("))
check(
  "경험 카드와 다르게 보인다",
  pageCss.includes(".profileCta {") && pageCss.includes("background: var(--brand-50);")
)
for (const term of ["적합도", "성향", "분석 완료", "%", "유형이에요"]) {
  check(`진단 표현 "${term}" 을 쓰지 않는다`, !page.includes(term))
}

console.log("\n[5] Experience card")

check("E) 카드가 경험 상세로 간다", list.includes("`/record/${experience.id}`"))
check("F) 발행본이 있을 때만 리포트 CTA 를 준다", list.includes("{showReport ? (") && list.includes("`/record/${experience.id}/report`"))
check("수업 유형 라벨은 기존 helper 다", list.includes("getExperienceTypeLabel(experience.classProgramType)"))
check(
  "학원명 · 자녀는 있을 때만 그린다",
  list.includes("{academyName ?") && list.includes("{showChildName ? (")
)
check("링크를 중첩하지 않는다", !list.includes("</Link>\n                    <Link"))
for (const term of ["별점", "점수", "순위", "랭킹", "rating", "score"]) {
  check(`"${term}" 을 만들지 않는다`, !list.includes(term) && !listCss.includes(term))
}

console.log("\n[6] 신호 표현")

check("리포트 배지", list.includes(">리포트<"))
check("내 생각 배지", list.includes(">내 생각 남김<"))
check(
  "G) 부정 배지를 만들지 않는다",
  !list.includes("리포트 없음") && !list.includes("생각 안 남김")
)
check(
  "G) 조회 실패 시 신호를 넘기지 않는다",
  page.includes("signals.error ? undefined : signals.reportedExperienceIds") &&
    page.includes("signals.error ? undefined : signals.decidedExperienceIds")
)
check(
  "신호가 없으면 줄 자체가 없다",
  list.includes("showReport || hasDecision(experience.id) ? (")
)
check("신호는 실제 조회 결과다", signals.includes("listMyPublishedReportsByChild") && signals.includes("getCurrentParentDecision"))

console.log("\n[7] 날짜")

check("KST helper 를 쓴다", list.includes("getSeoulDateTimeParts"))
check("UTC 문자열을 자르지 않는다", !list.includes('.slice(0, 10)') && !list.includes('.split("T")'))
check("canonical date helper 를 쓴다", list.includes("resolveParentExperienceDate(experience)"))

// 한국시간 2026-09-12 13:00 / 2026-08-12 13:00
const newer = application({
  id: "n",
  status: "completed",
  confirmedSlotAt: "2026-09-12T04:00:00.000Z",
  completedAt: "2026-09-12T06:00:00.000Z"
})
check(
  "실제 체험 시각을 날짜로 쓴다",
  resolveParentExperienceDate(newer) === "2026-09-12T04:00:00.000Z",
  resolveParentExperienceDate(newer)
)
check("최신순으로 정렬한다", list.includes("toTime(right.date) - toTime(left.date)"))

console.log("\n[8] empty · error")

check("H) 두 상태가 다른 분기다", page.includes("{applications.error ? (") && page.includes("experiences.length === 0 ? ("))
check("실패 문구", page.includes("교육 기록을 불러오지 못했어요.") && page.includes("잠시 후 다시 시도해 주세요."))
check("빈 상태 문구", page.includes("아직 쌓인 교육 기록이 없어요."))
check("빈 상태 보조 문구", page.includes("체험수업을 다녀오면 아이의 경험이 여기에 차곡차곡 쌓여요."))
check("빈 상태 CTA 는 하나, 홈으로 간다", page.includes('<Link href="/" className={styles.primaryButton}>'))

console.log("\n[9] route · 탭 · 건드리지 않은 것")

check("I) /record 는 기록 탭이다", resolveParentNavTab("/record") === "record")
check("공용 nav 를 쓴다", page.includes("<ParentBottomNav />"))
for (const route of [
  "app/record/[experienceId]/page.tsx",
  "app/record/[experienceId]/report/page.tsx",
  "app/record/profile/page.tsx"
]) {
  check(`${route} 가 그대로 있다`, exists(route))
}
check("옛 처리 타임라인 컴포넌트를 대체했다", !exists("src/features/record/ui/record-timeline.tsx"))
check("새 목록 컴포넌트가 있다", exists(LIST_PATH))
check(
  "touch target 이 44px 아래로 내려가지 않는다",
  listCss.includes("min-height: 44px") && pageCss.includes("min-height: 44px")
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
