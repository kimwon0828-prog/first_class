// 파일럿 피드백 F1 의 계약 검증.
//
//   npx tsx scripts/verify-parent-followup-feedback.ts
//
// 고정하는 것.
//   1. 네 개의 "이유/결과" 를 서로 섞지 않는다.
//   2. declined 를 enum 으로 쪼개지 않는다.
//   3. 이유·희망 일정도 과거 기록은 고칠 수 없다.
//   4. 내부 메모는 부모에게 나가지 않는다.
//   5. V1 발행본을 고치지 않고, V2 만 총평을 갖는다.
//   6. 총평도 발행 가능 내용이다.
//   7. 재발행에는 알림이 자동으로 나가지 않는다.
//   8. 알림 실패가 발행을 되돌리지 않는다.
//   9. 관찰 1회에는 횟수를 말하지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  PARENT_DECISION_OPTIONS,
  PARENT_DECLINE_REASON_OPTIONS,
  isParentDeclineReason,
  requiresPreferredSchedule
} from "@/features/decisions/lib/parent-decision"
import {
  buildEducationProfile,
  describeEvidenceCount
} from "@/features/profile/lib/education-profile"
import {
  EXPERIENCE_REPORT_CONTENT_VERSION,
  decodeExperienceReportSnapshot,
  getExperienceReportSummary
} from "@/features/reports/lib/experience-report-snapshot"

const MIGRATION_PATH =
  "supabase/migrations/20260916090000_add_parent_followup_and_report_summary.sql"
const PARENT_FORM_PATH = "src/features/decisions/ui/parent-decision-form.tsx"
const STUDIO_DECISION_PATH = "src/features/decisions/ui/studio-parent-decision.tsx"
const PARENT_REPORT_PATH = "app/record/[experienceId]/report/page.tsx"
const PROFILE_PAGE_PATH = "app/record/profile/page.tsx"
const PUBLISH_ACTION_PATH = "src/features/studio/actions/publish-experience-report.ts"
const ALIMTALK_TEMPLATE_PATH = "src/features/notifications/alimtalk/templates.ts"
const STUDIO_FORM_PATH = "src/features/studio/ui/application-trial-result-workflow.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripSql = (sql: string) =>
  sql.replace(/^\s*--[^\n]*$/gm, "").replace(/comment on [\s\S]*?;/gi, "")
const stripTs = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // URL 의 "//" 를 주석으로 자르지 않는다. 앞에 ":" 가 오면 주석이 아니다
    // (https:// 가 통째로 사라지면 "절대 주소가 없다" 는 거짓 실패가 난다).
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsx = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const clean = (source: string) => stripJsx(stripTs(source))

const migration = stripSql(read(MIGRATION_PATH))
const publishAction = clean(read(PUBLISH_ACTION_PATH))
const parentReport = clean(read(PARENT_REPORT_PATH))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("── 1. 네 개의 사실을 섞지 않는다 ──")
check(
  "decision 은 세 값 그대로다",
  PARENT_DECISION_OPTIONS.length === 3 &&
    PARENT_DECISION_OPTIONS.every((option) =>
      ["planned", "considering", "declined"].includes(option.value)
    )
)
check(
  "declined 를 enum 으로 쪼개지 않았다",
  !migration.includes("'declined_schedule'") && !migration.includes("'declined_price'")
)
check("부모 이유는 7개다", PARENT_DECLINE_REASON_OPTIONS.length === 7)
check(
  "부모 이유가 학원 미등록 사유 코드와 겹치지 않는다",
  // 학원 쪽 코드: schedule_mismatch · cost_burden · distance · child_reaction …
  // 겹치는 것이 있어도 같은 column 에 합치지 않는 것이 핵심이라, 여기서는
  // 서로 다른 table/column 에 산다는 것을 고정한다.
  migration.includes("alter table public.parent_decisions") &&
    !migration.includes("trial_applications.unregistered_reason") &&
    !migration.includes("unregistered_reason")
)
check(
  "RegistrationResult 를 건드리지 않는다",
  !migration.includes("registration_results") && !migration.includes("registration_status")
)
check(
  "학원이 부모 이유를 고칠 수 없다",
  !clean(read(STUDIO_DECISION_PATH)).includes("<form") &&
    !clean(read(STUDIO_DECISION_PATH)).includes("setParentDecision")
)

console.log("\n── 2. 이유와 희망 일정의 규칙 ──")
check(
  "declined 가 아니면 이유가 null 이다",
  /parent_decisions_decline_reason_scope_check[\s\S]*?decision = 'declined'\s*\n\s*or decline_reason is null/.test(
    migration
  )
)
check(
  // 기능이 생기기 전 declined 기록은 이유가 없다. 그건 위반이 아니라 사실이라
  // 제약으로 막지 않는다 — 막으면 migration 이 실패하거나 없던 이유를 지어내게 된다.
  "과거 declined 기록을 위반으로 만들지 않는다",
  !/decision = 'declined' and decline_reason is not null/.test(migration)
)
check(
  "새 기록에는 RPC 가 이유를 요구한다",
  migration.includes("raise exception 'decline_reason_required'")
)
check(
  "희망 일정은 시간대가 이유일 때만 있다",
  migration.includes("parent_decisions_preferred_schedule_scope_check")
)
check(
  "시간대가 이유면 날짜가 필요하다",
  migration.includes("parent_decisions_schedule_mismatch_requires_date_check")
)
check("판정 helper 가 같은 규칙이다", requiresPreferredSchedule("schedule_mismatch") === true)
check("다른 이유에는 묻지 않는다", requiresPreferredSchedule("price") === false)
check("모양이 어긋난 코드는 거절한다", !isParentDeclineReason("made_up") && !isParentDeclineReason(""))
check(
  "화면이 declined 를 바로 저장하지 않는다",
  clean(read(PARENT_FORM_PATH)).includes('type={isDecline ? "button" : "submit"}')
)
check(
  "이유가 필수 입력이다",
  clean(read(PARENT_FORM_PATH)).includes('name="declineReason"') &&
    clean(read(PARENT_FORM_PATH)).includes("required")
)

console.log("\n── 3. 과거 기록은 고칠 수 없다 ──")
for (const column of ["decline_reason", "preferred_date", "preferred_time_note"]) {
  check(
    `${column} 도 immutable 이다`,
    migration.includes(`new.${column} is distinct from old.${column}`)
  )
}
check(
  "선택이 바뀌면 새 row 가 생긴다",
  migration.includes("set superseded_at = v_now") &&
    migration.includes("insert into public.parent_decisions")
)
check(
  "같은 말을 다시 해도 기록을 늘리지 않는다",
  /v_current\.decline_reason is not distinct from v_reason/.test(migration)
)

console.log("\n── 4. 내부 메모는 부모에게 가지 않는다 ──")
check(
  "총평은 새 column 이다",
  migration.includes("add column if not exists public_summary")
)
check(
  "기존 note 를 공개로 돌리지 않는다",
  !migration.includes("note") || !/public_summary\s*=\s*note/.test(migration)
)
check(
  "부모 리포트가 note 를 읽지 않는다",
  !parentReport.includes(".note") && !parentReport.includes("consultation_note")
)
check(
  "학원 화면이 두 칸을 나눠 놓는다",
  clean(read(STUDIO_FORM_PATH)).includes('name="publicSummary"') &&
    clean(read(STUDIO_FORM_PATH)).includes('name="note"')
)

console.log("\n── 5. V1 은 그대로, V2 만 총평 ──")
check("지금 발행 version 은 2다", EXPERIENCE_REPORT_CONTENT_VERSION === 2)
check("migration 이 2로 적는다", migration.includes("'published', 2, v_content"))
check(
  "기존 발행본을 backfill 하지 않는다",
  !/update public\.experience_reports[\s\S]*?set content/i.test(migration)
)
{
  const v1 = decodeExperienceReportSnapshot(1, {
    experience: {
      type: "trial_class",
      date: "2026-09-03T01:00:00Z",
      child: { displayName: "아이", grade: "초3" },
      academy: { name: "학원" },
      class: { title: "수업" }
    },
    observations: [],
    recommendation: { course: null, level: null, schedule: null }
  })
  check("V1 은 그대로 읽힌다", v1 !== null)
  check("V1 에는 총평 개념이 없다", v1 !== null && getExperienceReportSummary(v1) === null)

  const v2 = decodeExperienceReportSnapshot(2, {
    experience: {
      type: "trial_class",
      date: "2026-09-03T01:00:00Z",
      child: { displayName: "아이", grade: "초3" },
      academy: { name: "학원" },
      class: { title: "수업" }
    },
    observations: [],
    summary: "오늘 아주 집중했어요.",
    recommendation: { course: null, level: null, schedule: null }
  })
  check("V2 는 총평을 갖는다", v2 !== null && getExperienceReportSummary(v2) === "오늘 아주 집중했어요.")
  check("알 수 없는 version 은 거절한다", decodeExperienceReportSnapshot(3, {}) === null)
}
check(
  "부모 리포트가 총평 카드를 그린다",
  parentReport.includes("선생님 총평") && parentReport.includes("getExperienceReportSummary")
)
check(
  "총평이 없으면 빈 카드를 만들지 않는다",
  parentReport.includes("{summary ? (")
)

console.log("\n── 6. 총평도 발행 가능 내용이다 ──")
check(
  "발행 판정에 총평이 들어간다",
  /coalesce\(btrim\(v_result\.public_summary\), ''\) = ''/.test(migration)
)
check(
  "전부 비면 여전히 막는다",
  migration.includes("report_content_missing")
)

console.log("\n── 7. 알림 ──")
check(
  "첫 발행에만 보낸다",
  publishAction.includes("const isFirstPublish = result.supersededVersion === null") &&
    publishAction.includes("if (isFirstPublish) {")
)
check(
  "재발행 분기에 발송이 없다",
  !/supersededVersion !== null[\s\S]{0,200}sendParentNotification/.test(publishAction)
)
check(
  "실패해도 발행을 되돌리지 않는다",
  publishAction.includes("sendParentNotificationSafely") &&
    !publishAction.includes("throw") &&
    publishAction.includes('status: "success"')
)
check(
  "발행 성공과 알림 실패를 구분해 말한다",
  publishAction.includes("다만 학부모 알림 발송에는 실패했어요")
)
check(
  "링크가 절대 주소다",
  publishAction.includes("https://firstsuup.com") &&
    publishAction.includes("/record/${applicationId}/report")
)
check(
  "링크가 없으면 보내지 않는다",
  clean(read(ALIMTALK_TEMPLATE_PATH)).includes("if (!reportUrl) {")
)
check(
  "기존 발송 인프라를 재사용한다",
  publishAction.includes("@/features/notifications/alimtalk/send-parent-notification")
)

console.log("\n── 8. 관찰 횟수 문구 ──")
check("1회면 말하지 않는다", describeEvidenceCount(1) === null)
check("2회면 개수로 말한다", describeEvidenceCount(2) === "2개의 체험에서 관찰됐어요")
check("3회도 같다", describeEvidenceCount(3) === "3개의 체험에서 관찰됐어요")
check(
  "화면이 null 을 그리지 않는다",
  clean(read(PROFILE_PAGE_PATH)).includes("describeEvidenceCount(observation.evidenceCount) ? (")
)
{
  const snapshot = (codes: string[]) => ({
    experience: {
      type: "trial_class",
      date: "2026-09-03T01:00:00Z",
      child: { displayName: "아이", grade: "초3" },
      academy: { name: "학원" },
      class: { title: "수업" }
    },
    observations: codes.map((code) => ({ code, label: code })),
    recommendation: { course: null, level: null, schedule: null }
  })
  const profile = buildEducationProfile({
    childId: "c",
    childName: "아이",
    reports: [
      { experienceId: "e1", reportId: "r1", reportVersion: 1, content: snapshot(["sustained_engagement"]), experienceDate: "2026-09-03T01:00:00Z" },
      { experienceId: "e2", reportId: "r2", reportVersion: 1, content: snapshot(["sustained_engagement"]), experienceDate: "2026-08-21T01:00:00Z" }
    ] as never
  })
  check("근거 row 는 그대로 남는다", profile.observations[0]?.sources.length === 2)
}

console.log("\n── 9. 데이터를 옮기지 않는다 ──")
check(
  "backfill 이 없다",
  !/\binsert into public\.parent_decisions\s*\(\s*application_id[\s\S]{0,200}select/i.test(migration) &&
    !/update public\.trial_results[\s\S]*?set public_summary/i.test(migration)
)
check(
  "기존 row 는 null 이 정상이다",
  !migration.includes("public_summary text not null") &&
    !migration.includes("decline_reason text not null")
)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
