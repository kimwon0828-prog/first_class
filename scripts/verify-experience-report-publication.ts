// 발행 도메인의 계약 검증.
//
//   npx tsx scripts/verify-experience-report-publication.ts
//
// 여기서 고정하는 것.
//   1.  draft 상태가 없다.
//   2.  상태는 published / superseded / withdrawn 셋뿐이다.
//   3.  한 Experience 에 살아 있는 발행본은 최대 1개다.
//   4.  스냅샷은 whitelist 다 — 내부 field 가 들어갈 자리가 없다.
//   5.  관찰은 code 와 발행 시점 label 을 함께 얼린다.
//   6.  옛 문구는 발행하지 않는다.
//   7.  발행된 content 는 고칠 수 없다.
//   8.  부모는 자기 published 만 읽는다.
//   9.  부모는 여전히 trial_results 를 읽지 못한다.
//   10. 발행/재발행이 한 transaction 안에서 직렬화된다.
//   11. DB 의 label 표와 TS 의 label 이 같다.
//   12. 학부모 계정이 없는 신청은 발행하지 않는다.
//   13. 확인한 Assessment revision 이 아니면 발행하지 않는다.
//   14. 체험 날짜가 없으면 발행하지 않는다.
//   15. 종료된 리포트는 되살아나지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.
// 실제 DB 동작 검증은 local disposable DB 에서 따로 한다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  EXPERIENCE_REPORT_FORBIDDEN_FIELDS,
  EXPERIENCE_REPORT_SNAPSHOT_TOP_LEVEL_KEYS,
  EXPERIENCE_REPORT_STATUSES,
  buildExperienceReportSnapshotV2,
  checkObservationPublicationEligibility,
  decodeExperienceReportSnapshot,
  hasPublishableReportContent
} from "@/features/reports/lib/experience-report-snapshot"
import { TRIAL_RESULT_OBSERVATION_OPTIONS } from "@/features/studio/lib/trial-result-options"

const MIGRATION_PATH = "supabase/migrations/20260914090000_create_experience_reports.sql"
const ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const MOCK_PATH = "src/shared/lib/db/mock-adapter.ts"
const SNAPSHOT_PATH = "src/features/reports/lib/experience-report-snapshot.ts"
const DETAIL_PAGE_PATH = "app/studio/(dashboard)/applications/[id]/page.tsx"
const PUBLISH_ACTION_PATH = "src/features/studio/actions/publish-experience-report.ts"
const WITHDRAW_ACTION_PATH = "src/features/studio/actions/withdraw-experience-report.ts"
const REPORT_UI_PATH = "src/features/studio/ui/application-report-publishing.tsx"
const WORKFLOW_UI_PATH = "src/features/studio/ui/application-trial-result-workflow.tsx"
const ANON_MIGRATION_PATH =
  "supabase/migrations/20260914120000_restrict_experience_report_rpc_execute.sql"
const CONTENT_MIGRATION_PATH =
  "supabase/migrations/20260914150000_require_experience_report_content.sql"
const PARENT_REPORT_QUERY_PATH = "src/features/record/queries/get-my-experience-report.ts"
const PARENT_REPORT_PAGE_PATH = "app/record/[experienceId]/report/page.tsx"
const PARENT_DETAIL_PAGE_PATH = "app/record/[experienceId]/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const migration = read(MIGRATION_PATH)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

const SOURCE = {
  programType: "trial_class",
  confirmedSlotAt: "2026-09-10T07:00:00.000Z",
  completedAt: "2026-09-10T09:00:00.000Z",
  childName: "민준",
  childGrade: "초3",
  academyName: "첫수업 학원",
  classTitle: "초등 저학년 창의 미술 체험",
  observations: ["active_participation", "verbal_explanation"],
  recommendedCourse: "초등 미술 정규반",
  recommendedLevel: "A2",
  recommendedSchedule: "화·목 16:00",
  publicSummary: null
}

console.log("── 1. draft 상태가 없다 ──")
check("TS 상태 목록에 draft 가 없다", !EXPERIENCE_REPORT_STATUSES.includes("draft" as never))
check("migration 의 status CHECK 에 draft 가 없다", !/status in \([^)]*draft/i.test(migration))
check(
  "migration 이 draft 를 명시적으로 배제한다",
  migration.includes("draft 는 없다") || migration.includes("draft 를 두지 않는다")
)

console.log("\n── 2. 상태는 셋뿐이다 ──")
check("TS 상태가 3개다", EXPERIENCE_REPORT_STATUSES.length === 3, EXPERIENCE_REPORT_STATUSES.join(", "))
for (const status of ["published", "superseded", "withdrawn"]) {
  check(`${status} 포함`, EXPERIENCE_REPORT_STATUSES.includes(status as never))
  check(`migration CHECK 에 ${status} 포함`, migration.includes(`'${status}'`))
}
check(
  "종료 상태 두 개가 한 row 에 같이 오지 못한다",
  migration.includes("experience_reports_lifecycle_timestamps_check")
)

console.log("\n── 3. 살아 있는 발행본은 최대 1개 ──")
check(
  "partial unique index 가 있다",
  /create unique index[\s\S]*?on public\.experience_reports \(application_id\)[\s\S]*?where status = 'published'/i.test(
    migration
  )
)
check("UNIQUE(application_id, version) 가 있다", migration.includes("unique (application_id, version)"))
check("version > 0 CHECK 가 있다", /check \(version > 0\)/.test(migration))

console.log("\n── 4. 스냅샷 whitelist ──")
const built = buildExperienceReportSnapshotV2(SOURCE)
check("정상 source 로 스냅샷이 만들어진다", built.status === "ok")
if (built.status === "ok") {
  const keys = Object.keys(built.snapshot)
  // V2 부터 summary 가 더해져 4개다. V1 스냅샷은 여전히 3개로 남는다.
  check("최상위 key 가 4개다", keys.length === 4, keys.join(", "))
  check(
    "최상위 key 가 계약과 같다",
    keys.every((key) => EXPERIENCE_REPORT_SNAPSHOT_TOP_LEVEL_KEYS.includes(key as never))
  )
  const serialized = JSON.stringify(built.snapshot)
  for (const field of EXPERIENCE_REPORT_FORBIDDEN_FIELDS) {
    check(`스냅샷에 ${field} 가 없다`, !serialized.includes(field))
  }
}
// 주석은 뺀다 — 금지 사항을 설명하는 문장 자체가 걸리면 안 된다.
const snapshotCode = read(SNAPSHOT_PATH)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "")
check(
  "builder 가 source 를 펼치지 않는다(spread 금지)",
  !/\.\.\.\s*(source|trialResult|application)\b/.test(snapshotCode)
)
check(
  "migration 도 row 를 펼치지 않고 field 를 적어 넣는다",
  migration.includes("jsonb_build_object") && !migration.includes("to_jsonb(v_result)")
)
check(
  "migration 이 내부 field 를 넣지 않는다",
  !/'(parent_reaction|next_action|note|registration_status)'\s*,\s*v_/.test(migration)
)

console.log("\n── 5. 관찰은 code + 발행 시점 label ──")
if (built.status === "ok") {
  check("관찰이 2건이다", built.snapshot.observations.length === 2)
  check(
    "각 항목이 code 와 label 을 모두 갖는다",
    built.snapshot.observations.every((item) => Boolean(item.code) && Boolean(item.label))
  )
  check(
    "label 이 현재 문구와 같다",
    built.snapshot.observations.every(
      (item) =>
        item.label ===
        TRIAL_RESULT_OBSERVATION_OPTIONS.find((option) => option.value === item.code)?.label
    )
  )
}
// 저장된 label 은 지금 문구로 덮어쓰지 않는다. 그래야 과거 리포트가 안 변한다.
const frozen = decodeExperienceReportSnapshot(1, {
  experience: {
    type: "trial_class",
    date: "2026-09-10T07:00:00.000Z",
    child: { displayName: "민준", grade: "초3" },
    academy: { name: "첫수업 학원" },
    class: { title: "수업" }
  },
  observations: [{ code: "active_participation", label: "예전 문구였어요." }],
  recommendation: { course: null, level: null, schedule: null }
})
check("decode 가 저장된 옛 label 을 그대로 돌려준다", frozen?.observations[0]?.label === "예전 문구였어요.")

console.log("\n── 6. 옛 문구는 발행하지 않는다 ──")
const legacyCase = checkObservationPublicationEligibility(["난이도가 높아 보였어요"])
check("legacy 단독 → 거절", legacyCase.status === "legacy_requires_review")
const mixedCase = checkObservationPublicationEligibility(["active_participation", "집중을 잘했어요"])
check("legacy 가 섞이면 canonical 이 있어도 거절", mixedCase.status === "legacy_requires_review")
const unknownCase = checkObservationPublicationEligibility(["made_up"])
check("unknown → 거절", unknownCase.status === "unknown_values")
check("빈 배열 → 발행 가능", checkObservationPublicationEligibility([]).status === "eligible")
check(
  "builder 가 legacy source 로 스냅샷을 만들지 않는다",
  buildExperienceReportSnapshotV2({ ...SOURCE, observations: ["이해가 빨랐어요"] }).status === "ineligible"
)
check("migration 이 legacy 를 거절한다", migration.includes("legacy_observations_require_review"))
check(
  "migration 이 문구를 code 로 바꾸지 않는다",
  !/when\s+'[^']*했어요'\s+then\s+'[a-z_]+'/.test(migration)
)

console.log("\n── 7. content 는 발행 뒤 못 고친다 ──")
check("immutability trigger 가 있다", migration.includes("experience_reports_immutable_content"))
for (const column of ["content", "content_version", "version", "application_id", "published_at", "published_by"]) {
  check(`trigger 가 ${column} 변경을 막는다`, migration.includes(`new.${column} is distinct from old.${column}`))
}
// 정책 블록을 하나씩 본다. 통째로 훑으면 publish 함수의 `for update of ta`(행 잠금)를
// 정책으로 잘못 읽는다.
const policyBlocks = migration
  .split("create policy ")
  .slice(1)
  .map((block) => block.slice(0, block.indexOf(";")))
check("정책이 2개다", policyBlocks.length === 2, `actual ${policyBlocks.length}`)
check(
  "모든 정책이 select 전용이다",
  policyBlocks.every((block) => /\bfor select\b/.test(block)),
  policyBlocks.map((block) => block.split("\n")[0]).join(" | ")
)
check(
  "insert / update / delete 정책이 없다",
  policyBlocks.every((block) => !/\bfor (insert|update|delete)\b/.test(block))
)

console.log("\n── 8. 부모 RLS ──")
check("RLS 를 켠다", migration.includes("alter table public.experience_reports enable row level security"))
check(
  "부모 정책이 published 로 제한된다",
  /experience_reports_parent_read_published[\s\S]*?status = 'published'/.test(migration)
)
check(
  "부모 정책이 자기 신청으로 제한된다",
  /experience_reports_parent_read_published[\s\S]*?ta\.parent_id = auth\.uid\(\)/.test(migration)
)
check("학원 정책이 조직 scope 를 쓴다", migration.includes("c.organization_id = app.current_org_id()"))

console.log("\n── 9. 부모는 trial_results 를 읽지 못한다 ──")
check("이 migration 이 trial_results 정책을 건드리지 않는다", !migration.includes("on public.trial_results"))
check("이 migration 이 trial_results 를 변경하지 않는다", !/alter table public\.trial_results/i.test(migration))

console.log("\n── 10. 발행은 한 transaction 안에서 직렬화된다 ──")
check("대상 신청을 잠근다", migration.includes("for update of ta"))
check(
  "supersede 와 insert 가 같은 함수 안에 있다",
  /publish_experience_report[\s\S]*?set status = 'superseded'[\s\S]*?insert into public\.experience_reports/.test(
    migration
  )
)
check("version 은 최대값 + 1 이다", migration.includes("coalesce(max(er.version), 0) + 1"))
check("발행 함수가 조직을 직접 확인한다", migration.includes("v_role not in ('academy', 'admin')"))
check("완료된 신청만 발행한다", migration.includes("application_not_completed"))
check("정의자 권한 함수의 search_path 가 고정돼 있다", (migration.match(/set search_path = public/g) ?? []).length >= 3)
check("PUBLIC 실행 권한을 회수한다", (migration.match(/revoke all on function/g) ?? []).length >= 3)
check("authenticated 에게만 실행을 준다", !/grant execute[\s\S]*?to (public|anon)/i.test(migration))
check("철회는 삭제가 아니다", migration.includes("withdrawn") && !/delete from public\.experience_reports/i.test(migration))

console.log("\n── 11. DB label 표와 TS label 이 같다 ──")
for (const option of TRIAL_RESULT_OBSERVATION_OPTIONS) {
  check(
    `${option.value} label 이 DB 와 같다`,
    migration.includes(`when '${option.value}' then '${option.label}'`)
  )
}

console.log("\n── 12. 학부모 계정이 없으면 발행하지 않는다 ──")
check("migration 이 parent_id null 을 거절한다", migration.includes("parent_not_linked"))
check(
  "거절이 lock 이후에 일어난다",
  migration.indexOf("for update of ta") < migration.indexOf("parent_not_linked")
)
check("mock 도 같은 판정을 한다", read(MOCK_PATH).includes('throw new Error("parent_not_linked")'))
check(
  "안내 문구가 있다",
  migration.includes("학부모 계정이 연결된 뒤 리포트를 발행할 수 있습니다.")
)

console.log("\n── 13. 확인한 revision 이 아니면 발행하지 않는다 ──")
check(
  "publish 가 expected revision 을 받는다",
  migration.includes("p_expected_assessment_updated_at timestamptz")
)
check("source row 도 잠근다", /from public\.trial_results tr[\s\S]*?for update;/.test(migration))
check(
  "revision 확인이 스냅샷 조립보다 먼저다",
  migration.indexOf("assessment_changed_since_preview") < migration.indexOf("v_content := jsonb_build_object")
)
check(
  "null revision 도 거절한다",
  migration.includes("p_expected_assessment_updated_at is null")
)
check(
  "grant 가 새 signature 를 가리킨다",
  migration.includes("grant execute on function public.publish_experience_report(uuid, timestamptz)")
)
check(
  "adapter 가 revision 을 넘긴다",
  read(ADAPTER_PATH).includes("p_expected_assessment_updated_at: expectedAssessmentUpdatedAt")
)
check(
  "mock 도 revision 을 확인한다",
  read(MOCK_PATH).includes('throw new Error("assessment_changed_since_preview")')
)

console.log("\n── 14. 체험 날짜는 필수다 ──")
check("migration 이 날짜 없음을 거절한다", migration.includes("experience_date_missing"))
check(
  "TS type 의 date 가 nullable 이 아니다",
  /experience: \{[\s\S]*?date: string\n/.test(snapshotCode)
)
check(
  "builder 가 날짜 없으면 스냅샷을 만들지 않는다",
  buildExperienceReportSnapshotV2({
    ...SOURCE,
    confirmedSlotAt: null,
    completedAt: null
  }).status === "ineligible"
)
const dateFallback = buildExperienceReportSnapshotV2({ ...SOURCE, confirmedSlotAt: null })
check("completed_at 으로 대신한다", dateFallback.status === "ok")
if (dateFallback.status === "ok") {
  check("fallback 날짜가 들어간다", dateFallback.snapshot.experience.date === SOURCE.completedAt)
}
check(
  "decoder 가 빈 날짜 스냅샷을 거절한다",
  decodeExperienceReportSnapshot(1, {
    experience: {
      type: "trial_class",
      date: null,
      child: { displayName: "민준", grade: "초3" },
      academy: { name: "학원" },
      class: { title: "수업" }
    },
    observations: [],
    recommendation: { course: null, level: null, schedule: null }
  }) === null
)

console.log("\n── 15. 종료된 리포트는 되살아나지 않는다 ──")
check(
  "terminal 상태의 UPDATE 를 막는다",
  migration.includes("old.status in ('superseded', 'withdrawn')") &&
    migration.includes("experience_report_lifecycle_is_terminal")
)
check(
  "published 에서 갈 수 있는 곳이 제한된다",
  migration.includes("new.status not in ('published', 'superseded', 'withdrawn')")
)
check("허용되지 않는 전이에 이름이 있다", migration.includes("experience_report_invalid_transition"))
check(
  "terminal 검사가 content 검사보다 먼저다",
  migration.indexOf("experience_report_lifecycle_is_terminal") <
    migration.indexOf("experience_report_is_immutable")
)

console.log("\n── 16. adapter 양쪽이 같은 표면을 갖는다 ──")
const adapter = read(ADAPTER_PATH)
const mock = read(MOCK_PATH)
for (const method of [
  "getPublishedExperienceReport",
  "listExperienceReportVersions",
  "publishExperienceReport",
  "withdrawExperienceReport"
]) {
  check(`supabase adapter 에 ${method}`, adapter.includes(method))
  check(`mock adapter 에 ${method}`, mock.includes(method))
}
check("adapter 가 raw jsonb 를 올려보내지 않는다", adapter.includes("decodeExperienceReportSnapshot"))
check(
  "publish 가 content 를 파라미터로 받지 않는다",
  adapter.includes("p_application_id: applicationId") && !adapter.includes("p_content")
)

console.log("\n── 17. Studio 발행 화면 계약 ──")
const detailPage = read(DETAIL_PAGE_PATH)
const publishAction = read(PUBLISH_ACTION_PATH)
const withdrawAction = read(WITHDRAW_ACTION_PATH)
const reportUi = read(REPORT_UI_PATH)

check(
  "미리보기를 공용 builder 로만 만든다",
  detailPage.includes("buildExperienceReportSnapshotV2")
)
check(
  "화면이 공개 내용을 따로 조립하지 않는다",
  !reportUi.includes("buildExperienceReportSnapshotV2") &&
    !reportUi.includes("trialResult.observations")
)
check(
  "발행본은 저장된 snapshot 을 그대로 쓴다",
  detailPage.includes("reportView.published?.content ?? null")
)
check(
  "발행본 조회가 별도 query 다",
  detailPage.includes("getPublishedExperienceReport")
)

console.log("\n── 18. server action 권한 ──")
for (const [name, source] of [
  ["publish", publishAction],
  ["withdraw", withdrawAction]
] as const) {
  check(`${name} action 이 Studio 접근을 확인한다`, source.includes("requireTeacherStudioAccess()"))
  check(
    `${name} action 이 조직 scope 를 좁힌다`,
    source.includes("getStudioTrialResultSaveContext(")
  )
  check(`${name} action 이 캐시를 되살린다`, source.includes("revalidatePath("))
}

// 발행과 철회의 권한은 다르다. 같은 flag 로 묶으면 작성을 무료로 여는 순간
// 발행까지 열리고, 반대로 발행을 잠그면 downgrade 된 학원이 이미 나간 리포트를
// 거둘 수 없게 된다. 두 방향을 각각 고정한다.
check(
  "publish 가 발행 entitlement 를 확인한다",
  publishAction.includes('requireStudioEntitlement(') &&
    publishAction.includes('"canPublishParentReport"')
)
check(
  "publish 가 작성 권한을 발행 gate 로 쓰지 않는다",
  !publishAction.includes('"canWriteTrialResults"')
)
check(
  "withdraw 에는 요금제 gate 가 없다",
  !withdrawAction.includes("requireStudioEntitlement(")
)
check(
  "publish 가 확인한 revision 을 넘긴다",
  publishAction.includes("expectedAssessmentUpdatedAt") &&
    publishAction.includes("dataAdapter.publishExperienceReport(")
)
check(
  "revision 이 비면 발행하지 않는다",
  publishAction.includes("확인한 체험평가 정보를 찾을 수 없습니다")
)

console.log("\n── 19. 실패 사유를 뭉개지 않는다 ──")
for (const code of [
  "parent_not_linked",
  "legacy_observations_require_review",
  "assessment_changed_since_preview",
  "experience_date_missing",
  "application_not_completed"
]) {
  check(`publish 가 ${code} 를 따로 안내한다`, publishAction.includes(code))
}
check(
  "withdraw 가 published_report_not_found 를 따로 안내한다",
  withdrawAction.includes("published_report_not_found")
)
check(
  "그 밖의 경우에만 일반 문구를 쓴다",
  publishAction.includes("리포트 발행에 실패했습니다")
)

console.log("\n── 20. 발행 차단 상태를 미리 알린다 ──")
for (const kind of [
  "parent_not_linked",
  "legacy_observations",
  "experience_date_missing",
  "no_assessment"
]) {
  check(`화면이 ${kind} 를 미리 막는다`, reportUi.includes(kind))
}
check("차단 이유를 글자로 말한다", reportUi.includes("BLOCKER_TEXT"))
check(
  "옛 문구를 원문으로 보여 준다",
  detailPage.includes("isLegacyTrialResultObservation") && reportUi.includes("activeBlocker.values")
)
check(
  "차단 상태면 발행 버튼이 비활성이다",
  reportUi.includes("disabled={!canPublish || isPublishing || isWithdrawing}")
)
check(
  "처리 중에는 다시 누를 수 없다",
  reportUi.includes('isPublishing\n                ? "발행 중..."') ||
    reportUi.includes('"발행 중..."')
)
check("철회에 확인 단계가 있다", reportUi.includes("리포트 발행을 철회할까요?"))
check(
  "철회가 삭제가 아니라고 말한다",
  reportUi.includes("발행 기록은 삭제되지 않고")
)
check(
  "평가 수정 이후 재발행을 안내한다",
  reportUi.includes("마지막 리포트 발행 이후 수정되었습니다")
)
check("Parent 화면 링크를 만들지 않는다", !reportUi.includes("/record"))

console.log("\n── 20-1. 발행본 조회 실패를 '없음' 으로 접지 않는다 ──")
check(
  "서버가 조회 오류를 버리지 않는다",
  detailPage.includes("const publishedReportLoadError = publishedReportResult.error")
)
check(
  "오류가 있으면 발행본을 없는 것으로 다루지 않는다",
  detailPage.includes("publishedReportLoadError ? null : publishedReportResult.data")
)
check(
  "오류를 화면까지 넘긴다",
  detailPage.includes("publishedReportLoadError={reportView.publishedReportLoadError}")
)
check(
  "오류만 있어도 Section 을 렌더한다",
  detailPage.includes("reportView.publishedReportLoadError ||")
)
check(
  "발행본을 모르면 평가 변경 여부를 단정하지 않는다",
  /const assessmentChangedSincePublish = Boolean\(\s*\n\s*published &&/.test(detailPage)
)
check("화면이 오류 상태를 받는다", reportUi.includes("publishedReportLoadError: string | null"))
check(
  "오류일 때 '없음' 이라고 말하지 않는다",
  reportUi.includes("발행 상태를 확인하지 못했습니다")
)
check(
  "오류 안내를 표시한다",
  reportUi.includes("현재 발행된 리포트 정보를 불러오지 못했습니다") &&
    reportUi.includes("화면을 새로고침한 뒤 다시 확인해 주세요")
)
check(
  "오류일 때 발행이 막힌다",
  /const canPublish =[\s\S]{0,160}!publishedReportLoadError/.test(reportUi)
)
check(
  "오류일 때 철회가 막힌다",
  /const canWithdraw =[\s\S]{0,80}!publishedReportLoadError/.test(reportUi) &&
    reportUi.includes("disabled={!canWithdraw || isPublishing || isWithdrawing}")
)
check(
  "오류일 때 발행 안내 문구를 띄우지 않는다",
  reportUi.includes("canPublishReport && !publishedReportLoadError ? (")
)
check(
  "화면이 발행 권한과 작성 권한을 섞지 않는다",
  reportUi.includes("canPublishReport: boolean") && !reportUi.includes("canWrite:")
)
check(
  "철회 버튼이 발행 권한에 묶이지 않는다",
  /const canWithdraw =(?![\s\S]{0,80}canPublishReport)/.test(reportUi)
)
// 무료 학원은 여기까지 와서 발행만 막힌다. 버튼만 사라지면 화면이 고장난 것처럼 보인다.
check(
  "발행이 잠기면 이유를 글자로 말한다",
  reportUi.includes("{!canPublishReport ? (") &&
    reportUi.includes("학부모 리포트 발행은 스탠다드 플랜에서 사용할 수 있어요.")
)
check(
  "잠금 안내가 기존 기록·발행본이 살아 있음을 말한다",
  reportUi.includes("체험 결과 작성과 미리보기는 계속 사용할 수 있고")
)
// 기록은 무료다. 작성이 유료라고 말하던 화면 계약이 남아 있으면 안 된다.
{
  const workflowUi = read(WORKFLOW_UI_PATH)
  check(
    "작성 권한을 기능별로 따로 받는다",
    workflowUi.includes("canWriteTrialResults: boolean") &&
      workflowUi.includes("canWriteConsultations: boolean") &&
      workflowUi.includes("canReopenConsultation: boolean")
  )
  check(
    "여러 기능을 하나의 paid 묶음으로 다시 묶지 않는다",
    !workflowUi.includes("paidWriteAccess") && !workflowUi.includes("isPaidWorkflowLocked")
  )
  check(
    "작성이 유료라고 말하던 안내가 남아 있지 않다",
    !workflowUi.includes("스탠다드 플랜에서 남길 수 있습니다")
  )
  check(
    "화면이 요금제 이름을 직접 비교하지 않는다",
    !/plan\s*===\s*["']/.test(workflowUi) && !/plan\s*===\s*["']/.test(reportUi)
  )
}

check(
  "잠금 안내는 경고 색을 쓰지 않는다",
  reportUi.includes("styles.lockedNotice") &&
    read("src/features/studio/ui/application-report-publishing.module.css").includes(
      "var(--surface-sub)"
    )
)
check(
  "미리보기는 계속 보여 준다",
  !/publishedReportLoadError[\s\S]{0,40}preview \? null/.test(reportUi)
)

console.log("\n── 21. anon 실행 권한 정리 ──")
const anonMigration = read(ANON_MIGRATION_PATH)
check(
  "publish 에서 anon 을 회수한다",
  anonMigration.includes("revoke execute on function public.publish_experience_report(uuid, timestamptz) from anon")
)
check(
  "withdraw 에서 anon 을 회수한다",
  anonMigration.includes("revoke execute on function public.withdraw_experience_report(uuid) from anon")
)
check(
  "label 함수도 anon 을 회수한다",
  anonMigration.includes("revoke execute on function public.experience_report_observation_label(text) from anon")
)
check("authenticated 는 유지한다", anonMigration.includes("to authenticated"))
check(
  "이미 적용된 migration 을 고치지 않았다",
  migration.includes("grant execute on function public.publish_experience_report(uuid, timestamptz) to authenticated;")
)

console.log("\n── 22. 빈 리포트는 발행하지 않는다 ──")
const contentMigration = read(CONTENT_MIGRATION_PATH)

const snapshotWith = (
  observations: { code: string; label: string }[],
  recommendation: { course: string | null; level: string | null; schedule: string | null }
) =>
  ({
    experience: {
      type: "trial_class",
      date: "2026-09-10T07:00:00.000Z",
      child: { displayName: "민준", grade: "초3" },
      academy: { name: "학원" },
      class: { title: "수업" }
    },
    observations,
    recommendation
  }) as never

const EMPTY_REC = { course: null, level: null, schedule: null }
const ONE_OBS = [{ code: "active_participation", label: "질문이나 활동 제안에 스스로 참여했어요." }]

check(
  "관찰 없음 + 추천 없음 → 발행 불가",
  !hasPublishableReportContent(snapshotWith([], EMPTY_REC))
)
check(
  "공백만 있는 추천은 내용이 아니다",
  !hasPublishableReportContent(snapshotWith([], { course: "   ", level: "  ", schedule: "" }))
)
check(
  "관찰 있음 + 추천 없음 → 발행 가능",
  hasPublishableReportContent(snapshotWith(ONE_OBS, EMPTY_REC))
)
check(
  "관찰 없음 + course 만 있음 → 발행 가능",
  hasPublishableReportContent(snapshotWith([], { course: "Python Basic", level: null, schedule: null }))
)
check(
  "관찰 없음 + schedule 만 있음 → 발행 가능",
  hasPublishableReportContent(snapshotWith([], { course: null, level: null, schedule: "화·목 16:00" }))
)
check(
  "관찰 있음 + 추천 있음 → 발행 가능",
  hasPublishableReportContent(snapshotWith(ONE_OBS, { course: "A", level: null, schedule: null }))
)

// snapshot 생성과 발행 가능 판정을 섞지 않는다(§7).
const emptyBuilt = buildExperienceReportSnapshotV2({ ...SOURCE, observations: [], recommendedCourse: null, recommendedLevel: null, recommendedSchedule: null })
check("빈 관찰로도 snapshot 자체는 만들어진다", emptyBuilt.status === "ok")
if (emptyBuilt.status === "ok") {
  check("그 snapshot 은 발행 대상이 아니다", !hasPublishableReportContent(emptyBuilt.snapshot))
}

console.log("\n── 23. DB 가 마지막으로 막는다 ──")
check("새 migration 이 report_content_missing 을 던진다", contentMigration.includes("report_content_missing"))
check(
  "공백 추천을 내용으로 세지 않는다",
  contentMigration.includes("coalesce(btrim(v_result.recommended_course), '') = ''") &&
    contentMigration.includes("coalesce(btrim(v_result.recommended_level), '') = ''") &&
    contentMigration.includes("coalesce(btrim(v_result.recommended_schedule), '') = ''")
)
check(
  "관찰이 하나라도 있으면 통과한다",
  contentMigration.includes("coalesce(jsonb_array_length(v_observations), 0) = 0")
)
check(
  "검사가 발행 직전에 있다",
  contentMigration.indexOf("report_content_missing") <
    contentMigration.indexOf("insert into public.experience_reports")
)
check(
  "legacy 판정이 content 판정보다 먼저다",
  contentMigration.indexOf("legacy_observations_require_review") <
    contentMigration.indexOf("report_content_missing")
)
// R1.1 hardening 을 하나도 잃지 않았는지.
for (const guard of [
  "not_authenticated",
  "application_not_found_or_forbidden",
  "for update of ta",
  "application_not_completed",
  "parent_not_linked",
  "assessment_changed_since_preview",
  "legacy_observations_require_review",
  "unknown_observations_cannot_publish",
  "experience_date_missing",
  "coalesce(max(er.version), 0) + 1",
  "set status = 'superseded'",
  "security definer",
  "set search_path = public"
]) {
  check(`재정의가 ${guard} 를 유지한다`, contentMigration.includes(guard))
}
check(
  "이미 적용된 migration 을 고치지 않았다",
  !migration.includes("report_content_missing")
)
check(
  "재정의 후 anon 권한을 다시 열지 않는다",
  contentMigration.includes("revoke execute on function public.publish_experience_report(uuid, timestamptz) from anon")
)
check(
  "공백 추천이 snapshot 에도 null 로 들어간다",
  contentMigration.includes("nullif(btrim(v_result.recommended_course), '')")
)

console.log("\n── 24. 화면이 먼저 막는다 ──")
check("blocker 종류에 추가됐다", reportUi.includes('kind: "report_content_missing"'))
check(
  "안내 문구가 있다",
  reportUi.includes("부모님께 전달할 리포트 내용이 아직 없습니다") &&
    reportUi.includes("관찰 내용이나 추천 정보를 확인한 뒤 발행해 주세요")
)
check("페이지가 판정 함수를 쓴다", detailPage.includes("hasPublishableReportContent(built.snapshot)"))
check(
  "앞선 blocker 가 있으면 덮어쓰지 않는다",
  detailPage.includes("blockers.length === 0 &&")
)
check("action 이 별도 문구로 안내한다", publishAction.includes("report_content_missing"))
check("mock 도 같은 판정을 한다", mock.includes('throw new Error("report_content_missing")'))

console.log("\n── 25. 학부모 리포트 화면 계약 ──")
const parentQuery = read(PARENT_REPORT_QUERY_PATH)
const parentReportPage = read(PARENT_REPORT_PAGE_PATH)
const parentDetailPage = read(PARENT_DETAIL_PAGE_PATH)

// 금지 사항을 설명하는 주석 자체가 검사에 걸리면 안 된다.
// 실제 코드에서 그 이름을 쓰는지만 본다.
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/\/\/[^\n]*/g, "")
const parentReportCode = stripComments(parentReportPage)
const parentDetailCode = stripComments(parentDetailPage)

check(
  "소유 확인이 리포트 조회보다 먼저다",
  parentQuery.indexOf("getMyExperienceDetail(experienceId)") <
    parentQuery.indexOf("getPublishedExperienceReport(experienceId)")
)
check(
  "남의 경험과 '리포트 없음' 을 구분한다",
  parentQuery.includes('status: "not_found"') && parentQuery.includes('status: "unavailable"')
)
check(
  "조회 실패를 '없음' 으로 접지 않는다",
  parentQuery.includes('status: "error"')
)
check("남의 경험은 notFound 다", parentReportPage.includes('result.status === "not_found"') && parentReportPage.includes("notFound()"))
check("학부모 인증을 요구한다", parentReportPage.includes("requireParentAccess("))

console.log("\n── 26. 학부모 화면은 발행본만 본다 ──")
check(
  "화면이 snapshot 만 읽는다",
  parentReportCode.includes("report.content") && !parentReportCode.includes("trialResult")
)
for (const forbidden of ["trial_results", "consultation_logs", "dataAdapter.getStudioTrialResultSaveContext"]) {
  check(`학부모 route 가 ${forbidden} 를 읽지 않는다`, !parentReportCode.includes(forbidden))
  check(`학부모 상세가 ${forbidden} 를 읽지 않는다`, !parentDetailCode.includes(forbidden))
}
for (const field of EXPERIENCE_REPORT_FORBIDDEN_FIELDS) {
  check(`학부모 화면에 ${field} 가 없다`, !parentReportCode.includes(field))
}
check(
  "관찰 문장을 다시 해석하지 않는다",
  parentReportCode.includes("{item.label}") &&
    !parentReportCode.includes("getTrialResultObservationLabel")
)

console.log("\n── 27. 성적표 어휘를 쓰지 않는다 ──")
// 판정·등급으로 읽히는 말을 학부모 화면에 들이지 않는다.
const JUDGMENT_WORDS = ["잘함", "부족함", "우수", "미흡", "상위", "하위", "점수", "등급", "적합도", "BEST", "강점", "약점"]
for (const word of JUDGMENT_WORDS) {
  check(`"${word}" 가 없다`, !parentReportCode.includes(word))
}
check(
  "첫수업이 분석했다고 말하지 않는다",
  !parentReportPage.includes("AI") && !parentReportPage.includes("첫수업이 평가")
)
check(
  "출처를 학원으로 밝힌다",
  parentReportPage.includes("체험 당시 학원에서 기록하고 발행한 내용")
)
check("version 을 학부모에게 보여 주지 않는다", !parentReportCode.includes("report.version"))

console.log("\n── 28. 리포트가 없으면 안내를 만들지 않는다 ──")
/*
 * 여기서 고정하는 것은 문법이 아니라 계약이다.
 *
 * reportResult.status 든 reportResult?.status 든 상관없다. 확인해야 하는 것은
 *   1. "리포트 보기" 로 가는 길이 발행본이 있을 때만 열린다
 *   2. 조회 실패가 "리포트 없음" 과 다른 분기로 갈라진다
 * 두 가지다. 정확한 문자열만 찾으면 안전한 리팩터링에도 검증이 깨진다(실제로 겪었다).
 */
const reportStatusFlag = (flag: string, status: string) =>
  new RegExp(`const\\s+${flag}\\s*=\\s*reportResult\\??\\.status === "${status}"`).test(parentDetailCode)

check(
  "발행본 여부를 발행 조회 결과에서 읽는다",
  reportStatusFlag("hasPublishedReport", "ok"),
  parentDetailCode.match(/const hasPublishedReport = .*/)?.[0] ?? "선언을 찾지 못했다"
)

/* 리포트로 가는 길은 하나뿐이고, 그 하나가 발행본 분기 안에 있어야 한다. */
const reportCtaPattern = /href=\{`\/record\/\$\{experience\.id\}\/report`\}/g
const reportCtaCount = parentDetailCode.match(reportCtaPattern)?.length ?? 0
const reportCtaAt = parentDetailCode.search(reportCtaPattern)
const publishedBranchAt = parentDetailCode.indexOf("{hasPublishedReport ? (")
const failedBranchAt = parentDetailCode.indexOf(") : reportLoadFailed ? (")

check("리포트 CTA 는 한 곳에만 있다", reportCtaCount === 1, `${reportCtaCount}곳`)
check(
  "발행본이 있을 때만 CTA 를 보여 준다",
  publishedBranchAt >= 0 && reportCtaAt > publishedBranchAt && reportCtaAt < failedBranchAt,
  `branch=${publishedBranchAt} cta=${reportCtaAt} failed=${failedBranchAt}`
)
check(
  "상세도 조회 실패를 구분한다",
  reportStatusFlag("reportLoadFailed", "error") && failedBranchAt > publishedBranchAt,
  parentDetailCode.match(/const reportLoadFailed = .*/)?.[0] ?? "선언을 찾지 못했다"
)
check(
  "조회 실패를 '리포트 없음' 으로 접지 않는다",
  parentDetailCode.includes("리포트 정보를 불러오지 못했어요.")
)
check(
  "빈 placeholder 카드를 만들지 않는다",
  !parentDetailCode.includes("아직 리포트가 없습니다")
)
check(
  "관찰은 목록 markup 이다",
  parentReportPage.includes("<ul") && parentReportPage.includes("<li")
)
check("추천은 정의 목록 markup 이다", parentReportPage.includes("<dl") && parentReportPage.includes("<dt"))

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
