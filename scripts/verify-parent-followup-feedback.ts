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
  formatLegacyPreferredDate,
  formatPreferredDays,
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
const SCHEDULE_MIGRATION_PATH =
  "supabase/migrations/20260916110000_add_parent_preferred_schedule_pattern.sql"
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
const scheduleMigration = stripSql(read(SCHEDULE_MIGRATION_PATH))
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
  // migration 이 먼저 적용되고 코드가 뒤따르는 사이, 구 화면은 이유를 물을
  // 방법이 없다. 그때 저장이 막히면 기능을 더하다가 있던 기능을 끄게 된다.
  "구 2-arg 는 전환 동안 declined 도 받는다",
  /public\.set_parent_decision_internal\(\s*\n\s*p_application_id, p_decision, null, null, null, true\s*\n\s*\)/.test(
    migration
  ) &&
    !/set_parent_decision\(\s*\n\s*p_application_id uuid,\s*\n\s*p_decision text\s*\n\)[\s\S]{0,400}raise exception 'decline_reason_required'/.test(
      migration
    )
)
console.log("\n── 2-b. bypass 를 호출자가 정할 수 없다 ──")
{
  // 화면이 무엇을 쓰는지는 경계가 아니다. PostgREST 는 grant 된 함수를
  // 누구에게나 그대로 열어 준다 — bypass 인자를 가진 함수가 authenticated 에게
  // 열려 있으면 학부모가 직접 true 로 넘길 수 있다.
  const signature = (args: string) =>
    new RegExp(`set_parent_decision\\(${args.replace(/[()]/g, "\\$&")}\\)`)

  check(
    "구현은 internal 로 분리돼 있다",
    migration.includes("create or replace function public.set_parent_decision_internal(")
  )
  check(
    "공개 5-arg 시그니처에 bypass 인자가 없다",
    (() => {
      const start = migration.indexOf(
        "create or replace function public.set_parent_decision(\n  p_application_id uuid,\n  p_decision text,\n  p_decline_reason text,"
      )
      if (start === -1) return false
      const head = migration.slice(start, migration.indexOf(")", start))
      return !head.includes("p_allow_missing_reason")
    })()
  )
  check(
    "공개 5-arg 는 항상 false 로 부른다",
    /p_preferred_time_note, false\s*\n\s*\);/.test(migration)
  )
  check(
    "구 2-arg 만 true 로 부른다",
    /p_application_id, p_decision, null, null, null, true\s*\n\s*\);/.test(migration) &&
      (migration.match(/, true\s*\n\s*\);/g) ?? []).length === 1
  )
  check(
    "internal 이 authenticated 에게 닫혀 있다",
    /revoke all on function public\.set_parent_decision_internal\(uuid, text, text, date, text, boolean\) from authenticated;/.test(
      migration
    )
  )
  check(
    "internal 이 anon · PUBLIC 에게도 닫혀 있다",
    /revoke all on function public\.set_parent_decision_internal\([^)]*\) from anon;/.test(migration) &&
      /revoke all on function public\.set_parent_decision_internal\([^)]*\) from public;/.test(migration)
  )
  check(
    "internal 에 grant 가 없다",
    !/grant execute on function public\.set_parent_decision_internal/.test(migration)
  )
  check(
    "공개 함수 둘만 authenticated 에 열린다",
    /grant execute on function public\.set_parent_decision\(uuid, text, text, date, text\) to authenticated;/.test(
      migration
    ) &&
      /grant execute on function public\.set_parent_decision\(uuid, text\) to authenticated;/.test(
        migration
      ) &&
      (migration.match(/grant execute on function public\.set_parent_decision/g) ?? []).length === 2
  )
  check(
    "공개 함수도 anon 에게는 닫혀 있다",
    /revoke all on function public\.set_parent_decision\(uuid, text, text, date, text\) from anon;/.test(
      migration
    ) && /revoke all on function public\.set_parent_decision\(uuid, text\) from anon;/.test(migration)
  )
  check(
    "wrapper 가 소유자 권한으로 internal 을 부른다",
    /create or replace function public\.set_parent_decision\(\s*\n\s*p_application_id uuid,\s*\n\s*p_decision text\s*\n\)[\s\S]{0,200}security definer/.test(
      migration
    )
  )
  void signature
}
check(
  "판정 자체는 그대로다",
  migration.includes("p_allow_missing_reason is not true")
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
  // ⚠️ supersededVersion 으로 추론하면 안 된다.
  //    발행 → 철회 → 다시 발행 이면 current 가 없어 null 이 되지만 최초가 아니다.
  "최초 발행 판정을 supersededVersion 으로 추론하지 않는다",
  !publishAction.includes("isFirstPublish = result.supersededVersion === null")
)
check(
  "DB 가 발행 이력으로 낸 값을 쓴다",
  publishAction.includes("const isFirstPublish = result.isFirstPublication") &&
    publishAction.includes("if (isFirstPublish) {")
)
check(
  "RPC 가 isFirstPublication 을 돌려준다",
  migration.includes("'isFirstPublication', v_is_first_publication")
)
check(
  "판정은 발행 이력 존재 여부다",
  migration.includes("v_is_first_publication := v_next_version = 1;")
)
check(
  "adapter 가 그 값을 그대로 전달한다",
  clean(read("src/shared/lib/db/supabase-adapter.ts")).includes(
    "isFirstPublication: result.isFirstPublication === true"
  )
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
  clean(read(ALIMTALK_TEMPLATE_PATH)).includes("if (!resolveTemplateValue(context.reportUrl ?? null))")
)

console.log("\n── 7-b. 실제 CTA 버튼 ──")
{
  const templates = clean(read(ALIMTALK_TEMPLATE_PATH))
  const client = clean(read("src/features/notifications/alimtalk/ncloud-alimtalk-client.ts"))
  const sender = clean(read("src/features/notifications/alimtalk/send-alimtalk.ts"))
  const types = clean(read("src/features/notifications/alimtalk/types.ts"))

  check("버튼 타입이 정의돼 있다", types.includes("export type AlimtalkButton"))
  check(
    "payload 가 버튼을 담을 수 있다",
    types.includes("buttons?: AlimtalkButton[]")
  )
  check(
    "버튼 이름이 계약대로다",
    templates.includes('name: "체험 리포트 확인하기"')
  )
  check(
    "모바일 · PC 링크가 리포트 주소다",
    templates.includes("linkMobile: reportUrl") && templates.includes("linkPc: reportUrl")
  )
  check("웹 링크 타입이다", templates.includes('type: "WL"'))
  check(
    "리포트 알림에만 버튼을 붙인다",
    templates.includes('if (context.eventType !== "trial_report_published") {') &&
      templates.includes("return undefined")
  )
  check(
    // 본문 링크는 기기에 따라 잘리거나 눌리지 않는다. 버튼이 그 일을 한다.
    "본문에 URL 을 적지 않는다",
    !templates.includes("▶ 체험 리포트 확인하기") && !/^\s*reportUrl\s*$/m.test(templates)
  )
  check("발송 경로가 버튼을 전달한다", sender.includes("buttons: renderedTemplate.template.buttons"))
  check("client 가 버튼을 payload 에 싣는다", client.includes("? { buttons } : {}"))
  check(
    // 버튼 없는 기존 4개 template 에 빈 배열을 보내면 template 과 어긋난다.
    "버튼이 없으면 key 자체를 싣지 않는다",
    client.includes("buttons && buttons.length > 0")
  )
}
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

console.log("\n── 8-b. 희망 일정은 날짜가 아니라 요일·시간대 ──")
{
  const form = clean(read(PARENT_FORM_PATH))
  const studio = clean(read(STUDIO_DECISION_PATH))
  const action = clean(read("src/features/decisions/actions/set-parent-decision.ts"))
  const domain = clean(read("src/features/decisions/lib/parent-decision.ts"))

  check(
    // 학부모가 아는 것은 "9월 22일" 이 아니라 "화·목 오후 4시 이후" 다.
    "학부모 화면에 달력 picker 가 없다",
    !form.includes('type="date"') && !form.includes('name="preferredDate"')
  )
  check(
    "요일을 복수로 고른다",
    form.includes('name="preferredDays"') && form.includes('type="checkbox"')
  )
  check("요일이 7개다", domain.includes("PREFERRED_DAY_OPTIONS") && (domain.match(/value: "(mon|tue|wed|thu|fri|sat|sun)"/g) ?? []).length === 7)
  check(
    "시간 조건이 셋이다",
    ["after", "exact", "range"].every((mode) => domain.includes(`value: "${mode}"`))
  )
  check(
    "끝 시각은 range 에만 묻는다",
    form.includes("requiresPreferredEndTime(timeMode)") &&
      domain.includes('mode === "range"')
  )
  check(
    "action 이 새 field 를 넘긴다",
    action.includes('formData.getAll("preferredDays")') &&
      action.includes('formData.get("preferredStartTime")') &&
      action.includes('formData.get("preferredTimeMode")') &&
      !action.includes("preferredDate")
  )

  check("새 column 을 더한다", scheduleMigration.includes("add column if not exists preferred_days text[]"))
  check(
    // 이미 Production 에 있는 column 이다. 값이 들어간 기록이 생기면 그건
    // 그때 학부모가 실제로 적은 날짜다.
    "기존 preferred_date 를 지우지 않는다",
    !/drop column[^;]*preferred_date/i.test(scheduleMigration)
  )
  check(
    "기존 값을 새 구조로 추측 변환하지 않는다",
    !/update public\.parent_decisions[\s\S]*?set preferred_days/i.test(scheduleMigration)
  )
  check(
    "요일 값을 제약으로 고정한다",
    scheduleMigration.includes("parent_decisions_preferred_days_check") &&
      scheduleMigration.includes("'mon','tue','wed','thu','fri','sat','sun'")
  )
  check(
    "시간 조건 값을 제약으로 고정한다",
    /preferred_time_mode in \('after', 'exact', 'range'\)/.test(scheduleMigration)
  )
  check(
    "요일·시각·조건은 함께 있거나 함께 없다",
    scheduleMigration.includes("parent_decisions_preferred_pattern_completeness_check")
  )
  check(
    "끝 시각은 range 에만, 시작보다 뒤",
    /preferred_time_mode = 'range' and preferred_end_time is not null and preferred_end_time > preferred_start_time/.test(
      scheduleMigration
    )
  )
  check(
    "시간대가 아닌 이유면 전부 null",
    /decline_reason = 'schedule_mismatch'\s*\n\s*or \(\s*\n\s*preferred_date is null/.test(scheduleMigration)
  )
  check(
    "과거 기록은 새 column 도 고칠 수 없다",
    ["preferred_days", "preferred_start_time", "preferred_end_time", "preferred_time_mode"].every(
      (column) => scheduleMigration.includes(`new.${column} is distinct from old.${column}`)
    )
  )
  check(
    "RPC 가 요일 미선택을 막는다",
    scheduleMigration.includes("raise exception 'preferred_days_required'")
  )
  check(
    "RPC 가 시간 미선택을 막는다",
    scheduleMigration.includes("raise exception 'preferred_time_required'")
  )
  check(
    "RPC 가 range 의 끝 시각을 요구한다",
    scheduleMigration.includes("raise exception 'preferred_end_time_required'") &&
      scheduleMigration.includes("raise exception 'preferred_end_time_invalid'")
  )
  check(
    "요일을 요일 순으로 정렬한다",
    scheduleMigration.includes("array_position(") && domain.includes("sortPreferredDays")
  )
  check(
    // bypass 인자를 가진 함수는 여전히 아무에게도 열려 있지 않다(F1 최종 계약).
    "internal 이 authenticated 에게 닫혀 있다",
    /revoke all on function public\.set_parent_decision_internal\(uuid, text, text, date, text, text\[\], time, time, text, boolean\) from authenticated;/.test(
      scheduleMigration
    ) && !/grant execute on function public\.set_parent_decision_internal/.test(scheduleMigration)
  )
  check(
    "새 공개 함수만 authenticated 에 열린다",
    /grant execute on function public\.set_parent_decision\(uuid, text, text, text\[\], time, time, text\) to authenticated;/.test(
      scheduleMigration
    )
  )
  check(
    "옛 6-arg internal 을 남겨 두지 않는다",
    scheduleMigration.includes(
      "drop function if exists public.set_parent_decision_internal(uuid, text, text, date, text, boolean);"
    )
  )

  console.log("\n── 8-c. legacy date 는 legacy 로 남는다 ──")
  check(
    // 학부모가 직접 고른 날짜다. 잘못된 데이터가 아니라 그때의 사실이고,
    // 저장을 막으면 전환 구간에 "등록하지 않겠다" 를 남길 수 없게 된다.
    "구 5-arg 가 날짜를 그대로 저장한다",
    /p_preferred_date, p_preferred_time_note,\s*\n\s*null, null, null, null,\s*\n\s*false/.test(
      scheduleMigration
    )
  )
  check(
    "그 날짜를 요일 패턴으로 변환하지 않는다",
    scheduleMigration.includes("v_legacy_date := p_preferred_date;") &&
      !/extract\(\s*dow/i.test(scheduleMigration) &&
      !/to_char\([^)]*preferred_date[^)]*'dy'/i.test(scheduleMigration)
  )
  check(
    "새 7-arg 는 날짜 자리를 항상 null 로 보낸다",
    /p_decline_reason,\s*\n\s*null, null,\s*\n\s*p_preferred_days/.test(scheduleMigration)
  )
  check(
    "date 와 pattern 은 상호 배타다 (RPC)",
    scheduleMigration.includes("raise exception 'preferred_schedule_form_conflict'")
  )
  check(
    "date 와 pattern 은 상호 배타다 (DB 제약)",
    scheduleMigration.includes("parent_decisions_preferred_form_exclusive_check")
  )
  check(
    "새 화면은 preferred_date 를 만들지 않는다",
    !form.includes("preferredDate") && !action.includes("preferredDate")
  )
  check(
    "Studio 가 옛 날짜를 숨기지 않는다",
    studio.includes("formatLegacyPreferredDate") && studio.includes("희망 날짜")
  )
  check(
    "새 패턴이 있으면 그것을 먼저 보여 준다",
    studio.includes("preferredSchedule ? (") && studio.includes(": legacyPreferredDate ? (")
  )

  console.log("\n── 8-d. 표시 문구 ──")
  check(
    "새 패턴 표시에 년·월·일이 없다",
    !studio.includes("formatPreferredDate(") && studio.includes("formatPreferredSchedule")
  )
  check(
    "요일 입력이 그대로 저장된다",
    // ["tue","thu"] 를 넣으면 그 둘만 남는다. 정렬만 하고 더하지 않는다.
    formatPreferredDays(["tue", "thu"]) === "화·목" &&
      formatPreferredDays(["thu", "tue", "mon"]) === "월·화·목"
  )
  check(
    "legacy 날짜 표시가 날짜 그대로다",
    formatLegacyPreferredDate("2026-09-22", "오후") === "9월 22일 · 오후" &&
      formatLegacyPreferredDate("2026-09-22", null) === "9월 22일"
  )
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
