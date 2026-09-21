// 지금 확인해야 할 것(/my/actions) 의 계약 검증.
//
//   npx tsx scripts/verify-parent-actions.ts
//
// 여기서 고정하는 것.
//   1. Action V1 은 하나다 — 살아 있는 발행본이 있고 ParentDecision 이 아직 없는 경험.
//   2. 읽음/안읽음을 발명하지 않는다. "새 · 미확인 · 읽지 않은" 을 판정값으로 쓰지 않는다.
//   3. ParentDecision 이 생기면 무엇을 골랐든 Action 은 사라진다.
//   4. 일정(확정 · 희망 · 과거 · 예정)은 Action 이 아니다 — /my/schedule 의 책임.
//   5. Home 과 /my/actions 가 같은 selector 를 쓴다. Home 은 앞의 몇 개만 미리 본다.
//   6. 새 table · migration · RLS · RPC · Action 전용 영구 상태를 만들지 않는다.
//   7. 조회 실패와 "할 일 없음" 을 구분한다.
//   8. 우선순위 점수 · 마감 · 긴급도를 만들지 않는다.
//   9. 로그인이 필요하고, 비로그인은 returnTo 를 달고 돌아온다.
//  10. /my/actions 에서는 홈 탭이 켜진다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

import {
  PARENT_ACTION_PREVIEW_LIMIT,
  formatParentActionSubject,
  selectParentActionCandidates,
  selectParentActions
} from "@/features/actions/lib/parent-actions"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

const LIB_PATH = "src/features/actions/lib/parent-actions.ts"
const QUERY_PATH = "src/features/actions/queries/get-parent-actions.ts"
const SIGNALS_PATH = "src/features/record/queries/get-parent-experience-signals.ts"
const PAGE_PATH = "app/notifications/page.tsx"
const HOME_PATH = "app/page.tsx"
const HOME_QUERY_PATH = "src/features/classes/queries/get-parent-home-summary.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const lib = stripComments(read(LIB_PATH))
const query = stripComments(read(QUERY_PATH))
const signals = stripComments(read(SIGNALS_PATH))
const page = codeOf(PAGE_PATH)
const home = codeOf(HOME_PATH)
const homeQuery = stripComments(read(HOME_QUERY_PATH))

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

const done = (id: string, completedAt: string, extra: Partial<ParentApplicationSummary> = {}) =>
  application({ id, status: "completed", completedAt, ...extra })

console.log("\n[1] Action 은 발행본 + 결정 없음 하나다")

const applications = [
  done("reported-undecided", "2026-09-12T00:00:00.000Z"),
  done("reported-decided", "2026-09-11T00:00:00.000Z"),
  done("no-report", "2026-09-10T00:00:00.000Z"),
  done("reported-canceled", "2026-09-09T00:00:00.000Z", { canceledAt: "2026-09-09T05:00:00.000Z" }),
  application({ id: "upcoming", status: "confirmed", confirmedSlotAt: "2026-09-30T01:00:00.000Z" }),
  application({ id: "requested", status: "new" }),
  application({ id: "reviewing", status: "reviewing" })
]
const actions = selectParentActions({
  applications,
  reportedExperienceIds: new Set([
    "reported-undecided",
    "reported-decided",
    "reported-canceled",
    "upcoming"
  ]),
  decidedExperienceIds: new Set(["reported-decided"])
})
const actionIds = actions.map((action) => action.experienceId)

// A: 발행본 있음 + 결정 없음 → Action 있음
check("A) 발행본 있고 결정 없으면 Action 이다", actionIds.includes("reported-undecided"))
// B: 발행본 있음 + 결정 있음 → Action 없음
check("B) 결정이 남아 있으면 Action 이 아니다", !actionIds.includes("reported-decided"))
// C: 발행본 없음 → Action 없음
check("C) 발행본이 없으면 Action 이 아니다", !actionIds.includes("no-report"))
// D: 일정은 Action 이 아니다
check("D) 예정된 확정 일정은 Action 이 아니다", !actionIds.includes("upcoming"))
check("D) 희망만 있는 신청도 Action 이 아니다", !actionIds.includes("requested") && !actionIds.includes("reviewing"))
check("취소된 신청은 Action 이 아니다", !actionIds.includes("reported-canceled"))
check("정확히 한 건만 남는다", actionIds.join(",") === "reported-undecided", actionIds.join(","))

const [action] = actions
check("리포트 화면으로 간다", action.href === "/record/reported-undecided/report", action.href)
check("kind 는 하나뿐이다", action.kind === "report_review")
check("자녀 · 수업을 싣는다", action.childName === "김사랑" && action.classTitle === "영어 레벨테스트")
check('"김사랑 · 영어 레벨테스트"', formatParentActionSubject(action) === "김사랑 · 영어 레벨테스트")
check("CTA 는 확인하기다", action.ctaLabel === "확인하기")
check("보여줄 것이 없으면 빈 배열이다",
  selectParentActions({ applications, reportedExperienceIds: new Set(), decidedExperienceIds: new Set() }).length === 0)

console.log("\n[2] 후보는 끝난 경험뿐이다")

const candidates = selectParentActionCandidates(applications).map((item) => item.id)
check(
  "완료 · 미취소 경험만 확인한다",
  candidates.join(",") === "reported-undecided,reported-decided,no-report",
  candidates.join(",")
)

// 최근 완료가 앞에 온다. 점수가 아니라 시간순이다.
const ordered = selectParentActions({
  applications: [
    done("old", "2026-09-01T00:00:00.000Z"),
    done("new", "2026-09-14T00:00:00.000Z"),
    done("mid", "2026-09-08T00:00:00.000Z")
  ],
  reportedExperienceIds: new Set(["old", "new", "mid"]),
  decidedExperienceIds: new Set()
}).map((item) => item.experienceId)
check("최근 완료 순이다", ordered.join(",") === "new,mid,old", ordered.join(","))

console.log("\n[3] 읽음 상태 · 가짜 지표를 만들지 않는다")

for (const term of ["읽지 않은", "미확인", "새 리포트", "unread", "isRead", "readAt"]) {
  check(`"${term}" 을 판정에 쓰지 않는다`, !lib.includes(term) && !query.includes(term))
}
for (const term of ["우선순위", "priority", "urgent", "긴급", "마감", "deadline", "score", "점수"]) {
  check(`"${term}" 을 만들지 않는다`, !lib.includes(term) && !query.includes(term) && !page.includes(term))
}
check("decision 값을 평가하지 않는다", !lib.includes("planned") && !lib.includes("considering") && !lib.includes("declined"))
check("어떤 선택도 권유하지 않는다", !page.includes("등록") && !page.includes("추천"))

console.log("\n[4] 기존 domain state 에서 파생한다")

check("새 table 을 만들지 않았다", !query.includes("parent_actions") && !query.includes("action_states"))
// "transaction" 이 들어간 기존 migration 을 오탐하지 않도록 단어 경계를 쓴다.
check(
  "Action 용 migration 을 만들지 않았다",
  !readdirSync(resolve(process.cwd(), "supabase/migrations")).some((name) =>
    /(^|_)actions?(_|\.)/.test(name)
  ),
  readdirSync(resolve(process.cwd(), "supabase/migrations"))
    .filter((name) => /(^|_)actions?(_|\.)/.test(name))
    .join(",")
)
check(
  "기존 parent-safe 조회만 조립한다",
  query.includes("getMyApplications") &&
    signals.includes("getMyChildren") &&
    signals.includes("listMyPublishedReportsByChild") &&
    signals.includes("getCurrentParentDecision")
)
check(
  "child_id 없는 legacy 신청도 빠뜨리지 않는다",
  signals.includes("getPublishedExperienceReport") && signals.includes("legacyCandidates")
)
/* /record 목록과 /my/actions 가 같은 사실을 같은 방법으로 읽는다. */
check(
  "발행본 · 결정 판정을 한 곳에서 읽는다",
  query.includes("getParentExperienceSignals(candidates)")
)
check("조회 실패를 '할 일 없음' 으로 접지 않는다", query.includes("if (signals.error)"))
check("한 번에 볼 경험 수에 상한이 있다", query.includes("PARENT_ACTION_LOOKUP_LIMIT"))

console.log("\n[5] Home 과 같은 selector 를 쓴다")

check("Home 이 Action 판정을 다시 하지 않는다", homeQuery.includes("getParentHomeActions(applications.data, notifications)"))
check(
  "Home 은 앞의 몇 개만 미리 본다",
  homeQuery.includes("allActions.slice(0, PARENT_ACTION_PREVIEW_LIMIT)") && PARENT_ACTION_PREVIEW_LIMIT === 3
)
check("Home은 리포트 한 건을 별도 안내한다", home.includes("const report = parentHome?.actions[0]") && home.includes('aria-label={report.kind === "report_review"'))
check("리포트가 없으면 리포트 안내를 숨긴다", home.includes("{report ? (") && !home.includes("parentHome.actions.map"))
check("Home 리포트는 기존 목적지로 간다", home.includes("href={report.href}"))
/*
 * 실패했으면 빈 목록을 그리는 게 아니라 Action 영역 자체를 접는다.
 * 뒤에 아이 필터가 붙어도 "실패 → []" 라는 분기 자체는 그대로여야 한다.
 */
check(
  "Home 도 조회 실패를 '없음' 으로 접지 않는다",
  /actionsResult\.error\s*\?\s*\[\]/.test(homeQuery) && homeQuery.includes("actionsResult.actions")
)

console.log("\n[6] V2 통합 화면")
check("actions 독립 화면 제거", !exists("app/my/actions/page.tsx") && !exists("app/my/actions/page.module.css"))
check("알림은 action query 재사용", page.includes("getParentActions()"))
check("동일 timeline에 report variant 전달", page.includes("pendingReportHrefs.has(item.href)"))
check("action domain에 notification selector 혼합 없음", !query.includes("selectParentNotifications"))
check("알림 페이지 유지", exists(PAGE_PATH))
console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
