// 신청 현황(/my/applications) 과 교육 기록(/record) 의 역할 분리 검증.
//
//   npx tsx scripts/verify-parent-applications-record.ts
//
// 여기서 고정하는 것.
//   1. 한 신청은 네 화면 중 한 자리에만 있다.
//        /my/applications  new · reviewing · confirmed · canceled
//        /record           completed
//        /my/schedule      확정된 미래
//        /my/actions       발행본 있고 결정 없음
//   2. canceled 는 신청 현황에서 사라지지 않지만 예정 일정처럼 보이지도 않는다.
//   3. /my/applications 는 redirect 가 아니라 실제 authenticated page 다.
//   4. status 문자열을 새로 만들지 않는다 — adapter 의 ApplicationStatus 가 전부다.
//   5. 가짜 진행률 · 응답 예정시간 · 우선순위 · 처리율을 만들지 않는다.
//   6. /record 는 완료 경험만 담고, 상세 접근 권한은 건드리지 않는다.
//   7. 신청/취소 후 사용자가 그 상태를 볼 수 있는 자리로 돌아간다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  APPLICATION_STATUS_IN_PROGRESS,
  hasAnyApplicationStatusItem,
  selectCanceledApplications,
  selectCompletedExperiences,
  selectInProgressApplications
} from "@/features/applications/lib/parent-application-split"
import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"
import { selectUpcomingConfirmedExperiences } from "@/features/schedule/lib/parent-schedule"
import { selectParentActionCandidates } from "@/features/actions/lib/parent-actions"
import type { ApplicationStatus, ParentApplicationSummary } from "@/shared/lib/db/adapter"

const SPLIT_PATH = "src/features/applications/lib/parent-application-split.ts"
const APPLICATIONS_PAGE = "app/my/applications/page.tsx"
const RECORD_PAGE = "app/record/page.tsx"
// Phase 6.3 에서 처리 타임라인을 경험 카드 목록으로 대체했다.
const RECORD_LIST_PATH = "src/features/record/ui/record-experience-list.tsx"
const HUB_PATH = "src/features/my/ui/my-hub.tsx"
const CANCEL_PATH = "src/features/applications/actions/cancel-my-application.ts"
const CREATE_PATH = "src/features/applications/actions/create-trial-application.ts"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const split = stripComments(read(SPLIT_PATH))
const applicationsPage = codeOf(APPLICATIONS_PAGE) + codeOf("app/my/applications/applications-list.tsx") + codeOf("src/features/applications/lib/parent-application-card.ts")
const recordPage = codeOf(RECORD_PAGE) + codeOf("src/features/record/ui/record-home.tsx")
const recordList = codeOf(RECORD_LIST_PATH)
const hub = codeOf(HUB_PATH)
const cancelAction = stripComments(read(CANCEL_PATH))
const createAction = stripComments(read(CREATE_PATH))
const adapter = read(ADAPTER_PATH)

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

const POOL: ParentApplicationSummary[] = [
  application({ id: "new-1", status: "new", createdAt: "2026-09-05T00:00:00.000Z" }),
  application({ id: "reviewing-1", status: "reviewing", createdAt: "2026-09-04T00:00:00.000Z" }),
  application({
    id: "confirmed-future",
    status: "confirmed",
    confirmedSlotAt: "2026-09-30T01:00:00.000Z",
    createdAt: "2026-09-03T00:00:00.000Z"
  }),
  application({
    id: "confirmed-past",
    status: "confirmed",
    confirmedSlotAt: "2026-09-01T01:00:00.000Z",
    createdAt: "2026-09-02T00:00:00.000Z"
  }),
  application({
    id: "completed-1",
    status: "completed",
    completedAt: "2026-09-08T00:00:00.000Z",
    createdAt: "2026-09-01T00:00:00.000Z"
  }),
  application({
    id: "canceled-1",
    status: "canceled",
    canceledAt: "2026-09-06T00:00:00.000Z",
    confirmedSlotAt: "2026-09-25T01:00:00.000Z",
    createdAt: "2026-08-30T00:00:00.000Z"
  })
]

console.log("\n[1] 한 신청은 한 자리에만 있다")

const statusIds = [
  ...selectInProgressApplications(POOL),
  ...selectCanceledApplications(POOL)
].map((item) => item.id)
const recordIds = selectCompletedExperiences(POOL).map((item) => item.id)
const scheduleIds = selectUpcomingConfirmedExperiences(POOL, Date.parse("2026-09-10T00:00:00.000Z")).map(
  (item) => item.id
)
const actionCandidateIds = selectParentActionCandidates(POOL).map((item) => item.id)

// B) non-completed → 신청 현황
check(
  "B) new · reviewing · confirmed · canceled 가 신청 현황이다",
  ["new-1", "reviewing-1", "confirmed-future", "confirmed-past", "canceled-1"].every((id) =>
    statusIds.includes(id)
  ),
  statusIds.join(",")
)
// C) completed → 신청 현황 제외
check("C) completed 는 신청 현황에 없다", !statusIds.includes("completed-1"))
// D) /record → completed 만
check("D) 기록은 completed 만이다", recordIds.join(",") === "completed-1", recordIds.join(","))
// E) 나머지는 기록 제외
check(
  "E) new · reviewing · confirmed · canceled 는 기록에 없다",
  ["new-1", "reviewing-1", "confirmed-future", "confirmed-past", "canceled-1"].every(
    (id) => !recordIds.includes(id)
  )
)
// F) /my/schedule 은 확정된 미래만 (기존 규칙 그대로)
check(
  "F) 일정은 확정된 미래만이다",
  scheduleIds.join(",") === "confirmed-future",
  scheduleIds.join(",")
)
// G) /my/actions 후보는 완료 경험만 (기존 규칙 그대로)
check(
  "G) 확인할 것 후보는 완료 경험만이다",
  actionCandidateIds.join(",") === "completed-1",
  actionCandidateIds.join(",")
)
check(
  "신청 현황과 기록이 겹치지 않는다",
  statusIds.every((id) => !recordIds.includes(id))
)

console.log("\n[2] 취소는 남지만 일정처럼 보이지 않는다")

check("취소가 신청 현황에 남는다", selectCanceledApplications(POOL).map((item) => item.id).includes("canceled-1"))
check(
  "취소만 있어도 비어 있지 않다",
  hasAnyApplicationStatusItem([application({ id: "only-canceled", status: "canceled" })])
)
check("취소는 일정에 오지 않는다", !scheduleIds.includes("canceled-1"))
check(
  "취소 카드는 따로 묶여 muted 로 그려진다",
  applicationsPage.includes("tab === 0 ? inProgress : canceled") && applicationsPage.includes('item.status === "canceled" ? styles.canceled')
)
check(
  "취소 카드의 확정 시각을 강조하지 않는다",
  applicationsPage.includes('item.status === "canceled" ? styles.canceled')
)
check("신청이 하나도 없으면 비어 있다", !hasAnyApplicationStatusItem([]))

console.log("\n[3] /my/applications 는 실제 page 다")

check("A) redirect 가 아니다", !applicationsPage.includes('redirect("/record")'))
check("A) authenticated page 다", applicationsPage.includes('requireParentAccess({ returnTo: "/my/applications" })'))
check("기존 parent-safe 조회를 쓴다", applicationsPage.includes("getMyApplications()"))
check("새 adapter method 를 만들지 않았다", !applicationsPage.includes("dataAdapter."))
check(
  "상태 문구는 기존 helper 가 정한다",
  applicationsPage.includes("resolveApplicationStatusDisplay(")
)
/* 값이 없으면 그 줄 자체를 만들지 않는다. */
check(
  "카드가 실제 값만 그린다",
  applicationsPage.includes("{item.academyName ?") &&
    applicationsPage.includes("{schedule ?") &&
    applicationsPage.includes("if (!value) return null")
)
check("상세는 기존 route 그대로다", applicationsPage.includes("`/record/${item.id}`"))
check(
  "확정 일정은 희망 일정보다 우선한다",
  applicationsPage.includes("item.confirmedSlotAt || item.requestedSlotAt")
)

console.log("\n[4] status 문자열을 새로 만들지 않는다")

const CANONICAL: ApplicationStatus[] = ["new", "reviewing", "confirmed", "completed", "canceled"]
for (const status of CANONICAL) {
  check(`adapter 에 "${status}" 가 있다`, adapter.includes(`| "${status}"`))
}
check(
  "신청 현황이 쓰는 상태가 canonical 안에 있다",
  APPLICATION_STATUS_IN_PROGRESS.every((status) => CANONICAL.includes(status))
)
check(
  "split 이 canonical 밖의 문자열을 만들지 않는다",
  (split.match(/"(new|reviewing|confirmed|completed|canceled)"/g)?.length ?? 0) > 0 &&
    !/"(pending|waiting|done|expired|rejected)"/.test(split)
)

console.log("\n[5] 가짜 지표를 만들지 않는다")

for (const term of ["진행률", "처리율", "응답 예정", "우선순위", "priority", "progress", "예상 소요"]) {
  check(`"${term}" 을 만들지 않는다`, !applicationsPage.includes(term) && !split.includes(term))
}
for (const term of ["별점", "점수", "AI", "성향", "rating"]) {
  check(`기록에 "${term}" 을 만들지 않는다`, !recordPage.includes(term) && !recordList.includes(term))
}

console.log("\n[6] /record 의 목록 기준과 상세 권한은 별개다")

check("기록이 완료만 고른다", recordPage.includes("selectCompletedExperiences(applications.data)"))
check(
  "상세 authorization 을 건드리지 않았다",
  exists("app/record/[experienceId]/page.tsx") &&
    codeOf("app/record/[experienceId]/page.tsx").includes("getMyExperienceDetail")
)
check("교육 프로필 진입점이 남아 있다", recordPage.includes('withRecordChild("/record/profile", profileChild.id)'))
check(
  "리포트 · 내 생각은 실제 조회로만 표시한다",
  recordPage.includes("getParentExperienceSignals(error ? [] : experiences)") &&
    recordPage.includes("signals.error ? undefined :")
)
check(
  "리포트 배지는 있을 때만 그린다",
  recordList.includes("showReport || hasDecision(experience.id) ? (")
)
check("빈 기록 문구가 새 역할을 말한다", recordPage.includes("아직 쌓인 교육 기록이 없어요."))
check(
  "진행 중 신청으로 빈 기록을 채우지 않는다",
  !recordPage.includes('status === "confirmed"') && !recordPage.includes('status === "new"')
)

console.log("\n[7] 신청 · 취소 후 돌아갈 자리")

check(
  "I) 취소 후 신청 현황으로 돌아간다",
  cancelAction.includes('requireParentAccess({ returnTo: "/my/applications" })')
)
check(
  "취소가 바꾸는 화면만 비운다",
  cancelAction.includes('revalidatePath("/my/applications")') &&
    cancelAction.includes('revalidatePath("/my/schedule")') &&
    cancelAction.includes('revalidatePath("/")') &&
    !cancelAction.includes('revalidatePath("/record")') &&
    !cancelAction.includes('revalidatePath("/my/actions")')
)
check(
  "새 신청은 신청 현황으로 보낸다",
  createAction.includes('redirectTo: "/my/applications"'),
  createAction.includes('redirectTo: "/record"') ? "아직 /record 로 보낸다" : ""
)

console.log("\n[8] MyHub · 하단 탭")

check("H) MyHub 에 신청 현황이 있다", hub.includes('href="/my/applications"') && hub.includes(">신청 현황<"))
check("H) MyHub 에 관심수업이 있다", hub.includes('href="/favorites"') && hub.includes(">관심수업<"))
check("일정 · 기록을 MyHub 에서 중복하지 않는다", !hub.includes('href="/my/schedule"') && !hub.includes('href="/record"'))

for (const [pathname, expected] of [
  ["/my/applications", "my"],
  ["/my/schedule", "schedule"],
  ["/record", "record"],
  ["/my/actions", "my"]
] as const) {
  check(`${pathname} → ${expected}`, resolveParentNavTab(pathname) === expected, String(resolveParentNavTab(pathname)))
}

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
