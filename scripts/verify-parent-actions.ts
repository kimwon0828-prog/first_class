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
import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

const LIB_PATH = "src/features/actions/lib/parent-actions.ts"
const QUERY_PATH = "src/features/actions/queries/get-parent-actions.ts"
const SIGNALS_PATH = "src/features/record/queries/get-parent-experience-signals.ts"
const PAGE_PATH = "app/my/actions/page.tsx"
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

check("Home 이 Action 판정을 다시 하지 않는다", homeQuery.includes("getParentActions()"))
check(
  "Home 은 앞의 몇 개만 미리 본다",
  homeQuery.includes("allActions.slice(0, PARENT_ACTION_PREVIEW_LIMIT)") && PARENT_ACTION_PREVIEW_LIMIT === 3
)
check(
  "더 있으면 전체 보기를 띄운다",
  homeQuery.includes("hasMoreActions: allActions.length > PARENT_ACTION_PREVIEW_LIMIT") &&
    home.includes('<Link href="/my/actions" className={styles.sectionHeadingLink}>')
)
check(
  "E) Action 0건이면 Home section 을 숨긴다",
  home.includes("const hasHighlightSection = Boolean(parentHome && parentHome.actions.length > 0)") &&
    home.includes("{homeHighlightSection}")
)
check("Home 의 각 줄은 그 Action 의 목적지로 간다", home.includes("<Link href={action.href}"))
check("Home 도 조회 실패를 '없음' 으로 접지 않는다", homeQuery.includes("actionsResult.error ? [] : actionsResult.actions"))

console.log("\n[6] 화면 계약")

check("route 가 있다", exists(PAGE_PATH))
check("H) 로그인 정책은 기존 것을 쓴다", page.includes('requireParentAccess({ returnTo: "/my/actions" })'))
check("제목이 있다", page.includes("지금 확인해야 할 것</h1>"))
check(
  "카드가 자녀 · 수업 · 제목 · CTA 를 그린다",
  page.includes("formatParentActionSubject(action)") &&
    page.includes("{action.title}") &&
    page.includes("{action.ctaLabel}")
)
check("학원명은 있을 때만 그린다", page.includes("{action.academyName ? ("))
check(
  "G) /my/actions 에서는 홈 탭이다",
  resolveParentNavTab("/my/actions") === "home" && page.includes("<ParentBottomNav />")
)
check("일정을 여기서 다루지 않는다", !page.includes("다가오는") && !page.includes("confirmedSlotAt"))

console.log("\n[7] empty · error")

check("빈 상태 문구가 따로 있다", page.includes("지금 확인할 내용이 없어요."))
check("빈 상태 보조 문구", page.includes("새로운 확인 사항이 생기면 여기에 보여드릴게요."))
// import 경로의 "classes" 가 아니라 실제 링크만 본다.
const pageLinks = [...page.matchAll(/href="([^"]+)"/g)].map((match) => match[1])
check(
  "빈 상태에서 수업 검색을 유도하지 않는다",
  !page.includes("수업 찾아보기") && !pageLinks.some((href) => href === "/" || href.startsWith("/classes")),
  pageLinks.join(" ")
)
check("실패 문구가 따로 있다", query.includes("확인할 내용을 불러오지 못했어요.") && page.includes("잠시 후 다시 시도해 주세요."))
check("실패와 0건이 다른 분기다", page.includes("{error ? (") && page.includes("actions.length === 0 ? ("))
check("조회 실패를 빈 목록으로 접지 않는다", query.includes("error: LOAD_ERROR_MESSAGE"))

console.log("\n[8] 만들지 않은 것")

/*
 * Phase 9 에서 알림함(/notifications)이 따로 생겼다.
 *
 * 그래서 "알림 페이지가 없다" 는 단언은 더 이상 맞지 않는다. 지켜야 할 것은
 * 파일의 부재가 아니라 두 화면이 다른 모델이라는 사실이다 —
 * Action 은 끝나면 사라지는 "지금 할 일", Notification 은 남는 "그때 있던 일".
 * /my/actions 가 이력 목록으로 바뀌지 않았는지를 대신 확인한다.
 */
check("/my/actions 는 알림함이 아니다", !page.includes("알림") && !query.includes("알림"))
check(
  "/my/actions 가 알림 selector 를 쓰지 않는다",
  !query.includes("selectParentNotifications") && !query.includes("features/notifications")
)
check("알림함은 자기 자리에 따로 있다", exists("app/notifications/page.tsx"))
check(
  "알림함이 /my/actions 하위로 들어가지 않았다",
  !exists("app/my/notifications")
)
check("/my/applications 가 남아 있다", exists("app/my/applications/page.tsx"))
check("/record 가 남아 있다", exists("app/record/page.tsx"))
check("/my 가 남아 있다", exists("app/my/page.tsx"))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
