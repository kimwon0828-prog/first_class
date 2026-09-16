// 알림함(/notifications) 계약 검증.
//
//   npx tsx scripts/verify-parent-notifications.ts
//
// 여기서 고정하는 것.
//   A. /notifications route 가 있다.
//   B. 비로그인은 returnTo=/notifications 를 달고 로그인으로 간다.
//   C. Home 상단 종이 /notifications 로 간다.
//   D. /notifications 에서는 홈 탭이 켜진다.
//   E. 읽음/안읽음을 schema 에도 화면에도 발명하지 않는다.
//   F. 실제 timestamp 가 있는 source 만 알림이 된다.
//   G. 리포트 알림은 발행본(published)만 근거로 삼는다.
//   H. 리포트 알림은 /record/{id}/report 로 간다.
//   I. Action selector 결과를 알림 목록으로 그대로 쓰지 않는다.
//   J. 추천 · 마케팅 알림을 만들지 않는다.
//   K. 전화번호 · provider metadata · 학원 내부 메모를 노출하지 않는다.
//   L. 빈 상태와 조회 실패가 다른 화면이다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"
import {
  groupNotificationsBySeoulDate,
  isNotifiableStatusEvent,
  resolveNotificationHref,
  selectParentNotifications,
  type ParentApplicationStatusEvent
} from "@/features/notifications/lib/parent-notifications"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"

const PAGE = "app/notifications/page.tsx"
const PAGE_CSS = "app/notifications/page.module.css"
const LIB = "src/features/notifications/lib/parent-notifications.ts"
const QUERY = "src/features/notifications/queries/get-parent-notifications.ts"
const HOME = "app/page.tsx"
const HOME_CSS = "app/page.module.css"
const NAV_LIB = "src/features/classes/lib/parent-nav.ts"
const ACTIONS_LIB = "src/features/actions/lib/parent-actions.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const page = codeOf(PAGE)
const pageCss = read(PAGE_CSS)
const lib = codeOf(LIB)
const query = codeOf(QUERY)
const home = codeOf(HOME)
const homeCss = read(HOME_CSS)
const navLib = codeOf(NAV_LIB)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("[A] route")

check("A) /notifications route 가 있다", exists(PAGE) && exists(PAGE_CSS))
check("A) 순수 계약 라이브러리가 따로 있다", exists(LIB))
check("A) 서버 조회가 따로 있다", exists(QUERY))

console.log("\n[B] 로그인 경계")

check("B) requireParentAccess 를 재사용한다", page.includes("requireParentAccess"))
check('B) returnTo 가 "/notifications" 다', page.includes('returnTo: "/notifications"'))
check("B) 서버 조회는 server-only 다", query.includes('import "server-only"'))

console.log("\n[C] Home bell")

/* 링크 목적지는 실제 href 값으로 확인한다. import 경로 문자열에 속지 않는다. */
const homeHrefs = Array.from(home.matchAll(/href=(?:"([^"]*)"|\{([^}]*)\})/g)).map(
  (m) => m[1] ?? m[2] ?? ""
)
check("C) Home 에 /notifications 링크가 있다", homeHrefs.includes("/notifications"))
check(
  'C) 아이콘만 있으므로 aria-label="알림" 이다',
  /href="\/notifications"[^>]*aria-label="알림"/.test(home.replace(/\s+/g, " "))
)
const iconRule = /\.headerIconButton\s*\{([^}]*)\}/.exec(homeCss)?.[1] ?? ""
const px = (rule: string, prop: string) =>
  Number(new RegExp(`${prop}\\s*:\\s*(\\d+)px`).exec(rule)?.[1] ?? 0)
check(
  "C) 종의 터치 타깃이 44px 이상이다",
  px(iconRule, "width") >= 44 && px(iconRule, "height") >= 44,
  `width=${px(iconRule, "width")} height=${px(iconRule, "height")}`
)

console.log("\n[D] nav active")

check("D) /notifications → 홈 탭", resolveParentNavTab("/notifications") === "home")
check("D) 하위 경로도 홈 탭", resolveParentNavTab("/notifications/anything") === "home")
check("D) nav 계약에 명시돼 있다", navLib.includes('"/notifications"'))
check("D) 화면이 공용 nav 를 쓴다", page.includes("<ParentBottomNav"))
check("D) 직접 만든 탭이 없다", !page.includes('aria-label="하단 탭"'))
/* 마이페이지가 같이 켜지지 않는다. */
check("D) 마이페이지 탭이 같이 켜지지 않는다", resolveParentNavTab("/notifications") !== "my")

console.log("\n[E] 읽음/안읽음을 발명하지 않는다")

const migrationsDir = resolve(process.cwd(), "supabase/migrations")
const migrationText = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
  .join("\n")
check(
  "E) schema 에 read_at · is_read 가 없다(전제 확인)",
  !/\bread_at\b/.test(migrationText) && !/\bis_read\b/.test(migrationText)
)
for (const term of ["읽음", "안 읽은", "새 알림", "unread", "readAt", "isRead"]) {
  check(`E) 화면에 "${term}" 이 없다`, !page.includes(term) && !lib.includes(term))
}
check("E) 배지 · 점을 만들지 않는다", !page.includes("badge") && !page.includes("dot") && !homeCss.includes(".bellDot"))
check("E) Home 종에도 배지가 없다", !/href="\/notifications"[\s\S]{0,400}?(badge|Badge|unread)/.test(home))

console.log("\n[F] 실제 timestamp 가 있는 source 만")

check("F) application_logs 의 created_at 을 쓴다", query.includes("created_at"))
check("F) experience_reports 의 published_at 을 쓴다", query.includes("published_at"))
/* confirmedSlotAt 은 수업이 열리는 시각이지 확정 사건의 시각이 아니다. */
check(
  "F) confirmedSlotAt 을 알림 시각으로 쓰지 않는다",
  !lib.includes("confirmedSlotAt") && !query.includes("confirmed_slot_at")
)
check(
  "F) published_at 이 비어 있으면 알림을 만들지 않는다",
  query.includes("filter((row) => Boolean(row.published_at))")
)
check("F) KST helper 를 쓴다", lib.includes("getSeoulDateTimeParts") && lib.includes("formatSeoulDateKey"))
check("F) UTC 문자열을 자르지 않는다", !lib.includes(".slice(0, 10)") && !lib.includes("substring(0, 10)"))

/* 시각이 없는 event 는 걸러진다. */
const baseEvent: ParentApplicationStatusEvent = {
  id: "log-1",
  applicationId: "app-1",
  fromStatus: "new",
  toStatus: "confirmed",
  actorId: "teacher-1",
  createdAt: "2026-09-16T04:00:00.000Z"
}
check("F) 정상 전이는 알림이 된다", isNotifiableStatusEvent(baseEvent, "parent-1"))
check(
  "F) 시각이 없으면 알림이 아니다",
  !isNotifiableStatusEvent({ ...baseEvent, createdAt: "" }, "parent-1")
)
check(
  "F) from === to 인 부가 로그는 알림이 아니다",
  !isNotifiableStatusEvent({ ...baseEvent, fromStatus: "confirmed" }, "parent-1")
)
/* 내가 낸 신청 · 내가 한 취소를 "첫수업에서 온 알림" 으로 되돌려 주지 않는다. */
check(
  "F) 학부모 자신이 만든 로그는 알림이 아니다",
  !isNotifiableStatusEvent({ ...baseEvent, actorId: "parent-1" }, "parent-1")
)
check(
  "F) new 는 알림이 아니다",
  !isNotifiableStatusEvent({ ...baseEvent, fromStatus: null, toStatus: "new" }, "parent-1")
)

console.log("\n[G][H] 리포트 알림")

check("G) 발행본만 읽는다", query.includes('.eq("status", "published")'))
check("G) 철회 · 대체본을 읽지 않는다", !query.includes("withdrawn") && !query.includes("superseded"))
/* 알림톡 발송 성공 여부를 알림 존재 조건으로 묶지 않는다. */
check(
  "G) 알림톡 발송 결과에 묶지 않는다",
  !query.includes("sms_logs") && !query.includes("alimtalk") && !lib.includes("alimtalk")
)
check("H) 리포트 CTA 는 /record/{id}/report 다", resolveNotificationHref("report_published", "exp-1") === "/record/exp-1/report")
check("H) 일정 확정은 /my/schedule 로 간다", resolveNotificationHref("schedule_confirmed", "exp-1") === "/my/schedule")
check("H) 완료 경험은 /record/{id} 로 간다", resolveNotificationHref("experience_completed", "exp-1") === "/record/exp-1")
check("H) 나머지 신청 변화는 /my/applications 로 간다", resolveNotificationHref("application_reviewing", "exp-1") === "/my/applications")

const application = {
  id: "exp-1",
  classId: "class-1",
  classTitle: "파이썬 체험",
  classProgramType: "trial_class",
  academyName: "씨큐브코딩 중계센터",
  organizationAddress: null,
  organizationAddressDetail: null,
  childId: "child-1",
  childName: "김사랑",
  childGrade: "초3",
  requestedScheduleBlockId: null,
  requestedSlotAt: "2026-09-10T01:00:00.000Z",
  confirmedSlotAt: "2026-09-12T01:00:00.000Z",
  completedAt: "2026-09-12T02:00:00.000Z",
  canceledAt: null,
  status: "completed"
} as unknown as ParentApplicationSummary

const notifications = selectParentNotifications({
  applications: [application],
  statusEvents: [baseEvent, { ...baseEvent, id: "log-self", actorId: "parent-1" }],
  publishedReports: [
    { reportId: "rep-1", applicationId: "exp-1", publishedAt: "2026-09-16T05:00:00.000Z" },
    { reportId: "rep-2", applicationId: "other", publishedAt: "2026-09-16T05:00:00.000Z" }
  ],
  parentProfileId: "parent-1"
})
check("G) 남의 신청 리포트는 들어오지 않는다", notifications.every((item) => !item.id.includes("rep-2")))
check("G) 내가 만든 로그는 빠진다", notifications.every((item) => item.id !== "status:log-self"))
check("최신순으로 정렬된다", notifications[0]?.id === "report_published:rep-1", notifications.map((i) => i.id).join(", "))
check("자녀 이름이 실제 값으로 붙는다", notifications[0]?.childName === "김사랑")
check("수업 · 학원 맥락이 붙는다", notifications[0]?.contextLabel === "파이썬 체험 · 씨큐브코딩 중계센터")

const groups = groupNotificationsBySeoulDate(notifications)
check("날짜는 KST 로 묶인다", groups.length > 0 && groups[0].dateKey === "2026-09-16", groups.map((g) => g.dateKey).join(", "))
check("날짜 라벨이 한국어다", groups[0]?.dateLabel === "9월 16일", groups[0]?.dateLabel)

console.log("\n[I] /my/actions 와 모델을 섞지 않는다")

check("I) Action selector 를 import 하지 않는다", !lib.includes("selectParentActions") && !query.includes("selectParentActions"))
check("I) Action query 를 import 하지 않는다", !query.includes("get-parent-actions") && !page.includes("getParentActions"))
check("I) 알림함은 자기 selector 를 쓴다", page.includes("getParentNotifications"))
check("I) Action 은 ParentDecision 으로 사라지지만 알림은 남는다", !lib.includes("decidedExperienceIds"))
check("I) Action 쪽 계약은 그대로다", exists(ACTIONS_LIB) && codeOf(ACTIONS_LIB).includes('"report_review"'))

console.log("\n[J] 마케팅 · 추천 알림 없음")

for (const term of ["추천", "인기", "할인", "이벤트", "프로모션", "AI", "맞춤 수업", "가격이 내려", "마감 임박"]) {
  check(`J) "${term}" 알림이 없다`, !page.includes(term) && !lib.includes(term))
}

console.log("\n[K] private data 경계")

check("K) sms_logs 를 source 로 쓰지 않는다", !query.includes("sms_logs"))
for (const term of ["phone", "recipient_phone", "template_key", "provider_message_id", "message_preview", "error_message"]) {
  check(`K) "${term}" 을 읽지 않는다`, !query.includes(term) && !lib.includes(term))
}
/* 학원이 적는 자유 문구다. 애초에 select 하지 않는다. */
check("K) application_logs 의 note 를 select 하지 않는다", !/select\([^)]*note/.test(query))
check("K) actor 이름을 읽지 않는다", !query.includes("actor_name") && !query.includes("actorName"))
check("K) actor 는 화면으로 나가지 않는다", !page.includes("actorId") && !page.includes("actor"))
check("K) 상담 메모 · CRM 이 없다", !query.includes("consultation") && !page.includes("상담 메모"))

console.log("\n[L] 빈 상태와 조회 실패 분리")

check("L) 빈 상태 문구가 있다", page.includes("아직 받은 알림이 없어요."))
check("L) 빈 상태 보조 문구가 있다", page.includes("첫수업과 관련된 새로운 소식이 생기면 여기에 보여드릴게요."))
check("L) 조회 실패 문구가 있다", query.includes("알림을 불러오지 못했어요.") && page.includes("잠시 후 다시 시도해 주세요."))
check("L) 실패를 없음으로 접지 않는다", page.includes("error ?") && page.includes("groups.length === 0"))
/* 알림함은 둘러보는 화면이 아니다. 빈 상태에 CTA 를 두지 않는다. */
const emptyBlock = /emptyState[\s\S]*?<\/section>/.exec(page)?.[0] ?? ""
check("L) 빈 상태에 CTA 가 없다", !emptyBlock.includes("<Link"))
check("L) 하단 여백은 공통 token 이다", pageCss.includes("padding-bottom: var(--parent-nav-space)"))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
