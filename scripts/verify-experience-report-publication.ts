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
  buildExperienceReportSnapshotV1,
  checkObservationPublicationEligibility,
  decodeExperienceReportSnapshot
} from "@/features/reports/lib/experience-report-snapshot"
import { TRIAL_RESULT_OBSERVATION_OPTIONS } from "@/features/studio/lib/trial-result-options"

const MIGRATION_PATH = "supabase/migrations/20260914090000_create_experience_reports.sql"
const ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const MOCK_PATH = "src/shared/lib/db/mock-adapter.ts"
const SNAPSHOT_PATH = "src/features/reports/lib/experience-report-snapshot.ts"

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
  recommendedSchedule: "화·목 16:00"
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
const built = buildExperienceReportSnapshotV1(SOURCE)
check("정상 source 로 스냅샷이 만들어진다", built.status === "ok")
if (built.status === "ok") {
  const keys = Object.keys(built.snapshot)
  check("최상위 key 가 3개다", keys.length === 3, keys.join(", "))
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
  buildExperienceReportSnapshotV1({ ...SOURCE, observations: ["이해가 빨랐어요"] }).status === "ineligible"
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
  buildExperienceReportSnapshotV1({
    ...SOURCE,
    confirmedSlotAt: null,
    completedAt: null
  }).status === "ineligible"
)
const dateFallback = buildExperienceReportSnapshotV1({ ...SOURCE, confirmedSlotAt: null })
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

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
