// 실제 등록 결과(RegistrationResult)의 계약 검증.
//
//   npx tsx scripts/verify-registration-result.ts
//
// 여기서 고정하는 것.
//   1. 값은 enrolled / not_enrolled 둘뿐이다.
//   2. pending / undecided 는 결과값이 아니다 — 결과 없음으로 표현한다.
//   3. 과거 결과는 고칠 수 없다.
//   4. 한 신청에 현재 결과는 하나뿐이다.
//   5. 쓰기는 동기화 trigger 하나로만 들어온다 — client 정책이 없다.
//   6. 학원은 자기 조직만 읽는다. 학부모는 읽지도 쓰지도 않는다.
//   7. legacy 이관은 확정 상태만, 시각을 창작하지 않고 한 번만.
//   8. registration_status 와 결과가 같은 transaction 에서 함께 움직인다.
//   9. ParentDecision 을 건드리지 않는다.
//  10. 학부모 DTO 에 raw 값이 나가지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  REGISTRATION_RESULT_VALUES,
  getRegistrationResultLabel,
  isRegistrationResult,
  isRegistrationResultOrigin,
  isUnresolvedRegistrationStatus
} from "@/features/registration/lib/registration-result"
import { canCollectParentDecision } from "@/features/decisions/lib/parent-decision"

const MIGRATION_PATH = "supabase/migrations/20260914230000_create_registration_results.sql"
const PARENT_DECISION_MIGRATION_PATH =
  "supabase/migrations/20260914220000_create_parent_decisions.sql"
const LIB_PATH = "src/features/registration/lib/registration-result.ts"
const QUERY_PATH = "src/features/registration/queries/get-studio-registration-result.ts"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"
const SUPABASE_ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const MOCK_PATH = "src/shared/lib/db/mock-adapter.ts"
const STUDIO_DETAIL_PATH = "app/studio/(dashboard)/applications/[id]/page.tsx"
const PARENT_DETAIL_PATH = "app/record/[experienceId]/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripSqlComments = (source: string) => source.replace(/^\s*--[^\n]*$/gm, "")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const migration = read(MIGRATION_PATH)
const stripCommentOnStatements = (sql: string) => sql.replace(/comment on [\s\S]*?;/gi, "")
// 주석과 comment on 문자열은 실행 계약이 아니다. 둘 다 걷어내고 본다 —
// 금지 대상을 "하지 않는다" 고 적어 둔 설명문이 그 자체로 위반처럼 잡히지 않도록.
const migrationSql = stripCommentOnStatements(stripSqlComments(migration))
const lib = read(LIB_PATH)
const supabaseAdapter = read(SUPABASE_ADAPTER_PATH)
const mockAdapter = read(MOCK_PATH)
const studioDetail = read(STUDIO_DETAIL_PATH)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

/**
 * SQL 함수 본문 하나를 떼어 온다.
 *
 * `;` 로 자르지 않는다 — plpgsql 본문 안에 `;` 가 널려 있어서 함수가 첫 줄에서
 * 잘려 나가고, 그러면 "본문에 없다" 는 통과가 거짓으로 난다. $$ ... $$ 로 끊는다.
 */
const extractFunctionBody = (sql: string, startPattern: RegExp) => {
  const match = startPattern.exec(sql)
  if (!match) return null
  const rest = sql.slice(match.index)
  const open = rest.indexOf("$$")
  if (open === -1) return null
  const close = rest.indexOf("$$", open + 2)
  return close === -1 ? rest : rest.slice(0, close + 2)
}

console.log("── 1. 값은 둘뿐이다 ──")
check("canonical 값이 2개다", REGISTRATION_RESULT_VALUES.size === 2, `actual ${REGISTRATION_RESULT_VALUES.size}`)
for (const value of ["enrolled", "not_enrolled"]) {
  check(`${value} 포함`, REGISTRATION_RESULT_VALUES.has(value))
  check(`migration CHECK 에 ${value}`, migrationSql.includes(`'${value}'`))
  check(`${value} 에 화면 문구가 있다`, getRegistrationResultLabel(value as never).length > 0)
}
check(
  "result CHECK 이 정확히 두 값이다",
  /check \(result in \('enrolled', 'not_enrolled'\)\)/.test(migrationSql)
)
check("origin 은 studio / legacy 둘뿐이다", isRegistrationResultOrigin("studio") && isRegistrationResultOrigin("legacy_registration_status"))
check("origin 에 다른 값이 없다", !isRegistrationResultOrigin("parent") && !isRegistrationResultOrigin("admin"))

console.log("\n── 2. pending / undecided 는 결과가 아니다 ──")
for (const nonResult of ["pending", "undecided", "considering", "planned", "declined", "", null]) {
  check(`${String(nonResult)} 는 결과값이 아니다`, !isRegistrationResult(nonResult))
  check(`${String(nonResult)} 는 미확정으로 읽힌다`, isUnresolvedRegistrationStatus(nonResult))
}
check("enrolled 는 확정이다", !isUnresolvedRegistrationStatus("enrolled"))
check("not_enrolled 는 확정이다", !isUnresolvedRegistrationStatus("not_enrolled"))
check(
  "CHECK 제약이 pending / undecided 를 허용하지 않는다",
  !/check \(result in [^)]*'pending'/.test(migrationSql) &&
    !/check \(result in [^)]*'undecided'/.test(migrationSql)
)
check(
  "동기화가 확정 상태에서만 결과를 만든다",
  /if new\.registration_status in \('enrolled', 'not_enrolled'\) then/.test(migrationSql)
)

console.log("\n── 3. 과거 결과는 고칠 수 없다 ──")
const immutableFn = extractFunctionBody(
  migrationSql,
  /create or replace function public\.reject_registration_result_mutation/
)
check("불변 함수가 있다", immutableFn !== null)
for (const column of ["id", "application_id", "result", "origin", "recorded_by", "resolved_at", "created_at"]) {
  check(
    `${column} 변경을 막는다`,
    immutableFn !== null && immutableFn.includes(`new.${column} is distinct from old.${column}`)
  )
}
check(
  "이미 지나간 기록의 시각도 고칠 수 없다",
  immutableFn !== null &&
    immutableFn.includes("old.superseded_at is not null and new.superseded_at is distinct from old.superseded_at")
)
check("BEFORE UPDATE trigger 로 건다", /before update on public\.registration_results/.test(migrationSql))
check("함수가 search_path 를 고정한다", immutableFn !== null && immutableFn.includes("set search_path = public"))
check(
  "DELETE 로 이력을 지우는 경로를 만들지 않는다",
  !/on delete cascade/.test(migrationSql) && /on delete restrict/.test(migrationSql)
)

console.log("\n── 4. 현재 결과는 하나뿐이다 ──")
check(
  "partial unique index 가 있다",
  /create unique index[^;]*registration_results_one_current[\s\S]*?where superseded_at is null/.test(migrationSql)
)
check(
  "current 판정은 superseded_at IS NULL 이다",
  supabaseAdapter.includes('.is("superseded_at", null)')
)
check(
  "동기화가 현재 결과를 잠그고 본다",
  /where rr\.application_id = new\.id[\s\S]*?and rr\.superseded_at is null[\s\S]*?for update/.test(migrationSql)
)
check(
  "같은 결과를 다시 저장하면 이력을 늘리지 않는다",
  /if found and v_current\.result = new\.registration_status then\s*\n\s*return new;/.test(migrationSql)
)

console.log("\n── 5. 쓰기 경로는 하나다 ──")
const policyStatements = migrationSql.match(/create policy[\s\S]*?;/g) ?? []
check("정책이 1개다", policyStatements.length === 1, `actual ${policyStatements.length}`)
check("그 정책이 SELECT 전용이다", policyStatements.every((policy) => /\bfor select\b/.test(policy)))
for (const action of ["for insert", "for update", "for delete", "for all"]) {
  check(`${action} 정책이 없다`, !policyStatements.some((policy) => policy.includes(action)))
}
check("RLS 를 켠다", /alter table public\.registration_results enable row level security/.test(migrationSql))
check(
  "동기화 함수가 security definer 다",
  /create or replace function public\.sync_registration_result\(\)[\s\S]*?security definer/.test(migrationSql)
)
check(
  "동기화 함수가 search_path 를 고정한다",
  /create or replace function public\.sync_registration_result\(\)[\s\S]*?set search_path = public/.test(migrationSql)
)
check(
  "adapter 에 결과 쓰기 method 가 없다",
  !read(ADAPTER_PATH).includes("setRegistrationResult") &&
    !supabaseAdapter.includes("setRegistrationResult") &&
    !mockAdapter.includes("setRegistrationResult")
)
check(
  "코드가 registration_results 에 INSERT / UPDATE 하지 않는다",
  !/from\("registration_results"\)\s*\n?\s*\.(insert|update|upsert|delete)/.test(supabaseAdapter)
)

console.log("\n── 6. 읽기는 자기 조직만 ──")
const teacherPolicy = policyStatements[0] ?? ""
check("teacher 역할을 확인한다", teacherPolicy.includes("app.current_role() = 'teacher'"))
check("조직을 확인한다", teacherPolicy.includes("c.organization_id = app.current_org_id()"))
check("authenticated 에만 연다", teacherPolicy.includes("to authenticated"))
check(
  "학부모 SELECT 정책이 없다",
  !policyStatements.some((policy) => policy.includes("auth.uid()"))
)
check(
  "학부모 화면이 결과를 직접 읽지 않는다",
  !stripComments(read(PARENT_DETAIL_PATH)).includes("registration_results") &&
    !stripComments(read(PARENT_DETAIL_PATH)).includes("registrationResult")
)
check(
  "학원 조회는 읽기 전용이다",
  !read(QUERY_PATH).includes("insert") && !read(QUERY_PATH).includes("update")
)

console.log("\n── 7. legacy 이관 ──")
const backfill = migrationSql.slice(migrationSql.lastIndexOf("insert into public.registration_results"))
check("이관이 확정 상태만 고른다", backfill.includes("where ta.registration_status in ('enrolled', 'not_enrolled')"))
check(
  "pending / undecided 를 이관하지 않는다",
  !backfill.includes("'pending'") && !backfill.includes("'undecided'")
)
check("origin 을 legacy 로 남긴다", backfill.includes("'legacy_registration_status'"))
check(
  "확정 시각을 창작하지 않는다",
  backfill.includes("then ta.enrolled_at") &&
    backfill.includes("else ta.lost_at") &&
    !/resolved_at[^)]*now\(\)/.test(backfill)
)
check("recorded_by 를 지어내지 않는다", /'legacy_registration_status',\s*\n\s*null,/.test(backfill))
check(
  "재실행해도 두 번 만들지 않는다",
  backfill.includes("not exists") && backfill.includes("rr.superseded_at is null")
)
check("recorded_by 가 null 을 허용한다", /recorded_by uuid,/.test(migrationSql))
check("resolved_at 이 null 을 허용한다", /resolved_at timestamptz,/.test(migrationSql))

console.log("\n── 8. legacy 상태와 어긋나지 않는다 ──")
check(
  "동기화를 registration_status 변경에 건다",
  /after insert or update of registration_status on public\.trial_applications/.test(migrationSql)
)
check("행 단위로 돈다", /for each row execute function public\.sync_registration_result/.test(migrationSql))
check(
  "미확정으로 돌아가면 현재 결과를 비운다",
  /-- pending \/ undecided 는 결과가 아니다[\s\S]*?set superseded_at = now\(\)/.test(migration)
)
check(
  "결과가 바뀌면 덮어쓰지 않고 이력을 남긴다",
  /set superseded_at = now\(\)[\s\S]*?insert into public\.registration_results/.test(migrationSql)
)
check(
  "확정 시각을 legacy timestamp 에서 가져온다",
  /when new\.registration_status = 'enrolled' then new\.enrolled_at/.test(migrationSql) &&
    /else new\.lost_at/.test(migrationSql)
)
check(
  "registration_status column 을 건드리지 않는다",
  !/alter table public\.trial_applications[\s\S]*?(drop column|registration_status_check)/.test(migrationSql)
)
check(
  "consultation_logs 를 건드리지 않는다",
  !migrationSql.includes("consultation_logs")
)

console.log("\n── 9. ParentDecision 과 섞이지 않는다 ──")
check("migration 이 parent_decisions 를 쓰지 않는다", !migrationSql.includes("parent_decisions"))
check(
  "ParentDecision migration 이 registration_results 를 모른다",
  !read(PARENT_DECISION_MIGRATION_PATH).includes("registration_results")
)
check(
  "결과 값과 의향 값이 겹치지 않는다",
  ["planned", "considering", "declined"].every((value) => !REGISTRATION_RESULT_VALUES.has(value))
)
check(
  "변환 표를 두지 않는다",
  !lib.includes('planned:') && !lib.includes('considering:') && !lib.includes('declined:')
)
check(
  "학원 화면이 둘을 다른 값으로 읽는다",
  studioDetail.includes("getStudioParentDecision") && studioDetail.includes("getStudioRegistrationResult")
)

console.log("\n── 10. 학부모 경계 ──")
check("확정된 결과가 있으면 묻지 않는다", canCollectParentDecision(true) === false)
check("확정된 결과가 없으면 묻는다", canCollectParentDecision(false) === true)
check("값이 없어도 묻는다", canCollectParentDecision(null) === true)
check(
  "판정 근거가 computed column 이다",
  supabaseAdapter.includes("canCollectParentDecision(row.has_current_registration_result)")
)
check(
  "computed column 이 boolean 만 돌려준다",
  /create or replace function public\.has_current_registration_result\(public\.trial_applications\)\s*\nreturns boolean/.test(migrationSql)
)

// ── computed column 의 소유권 경계 ──
//
// security definer 함수는 정의한 사람의 권한으로 돈다. 호출 맥락(여기서는
// trial_applications 의 RLS 가 먼저 걸러 주는 computed column 경로)에 기대면,
// 그 함수를 직접 부를 수 있게 되는 순간 남의 신청에 대한 답을 내주게 된다.
// 그래서 소유권을 함수 안에서 최종 보장하는지 본다.
const computedColumnFn = extractFunctionBody(
  migrationSql,
  /create or replace function public\.has_current_registration_result\(public\.trial_applications\)/
)
check("computed column 함수를 찾는다", computedColumnFn !== null)
check(
  "security definer 다",
  computedColumnFn !== null && /security definer/.test(computedColumnFn)
)
check(
  "search_path 를 고정한다",
  computedColumnFn !== null && computedColumnFn.includes("set search_path = public")
)
check(
  "저장된 trial_applications 를 다시 조회한다",
  computedColumnFn !== null && /from public\.trial_applications ta\s*\n\s*where ta\.id = \$1\.id/.test(computedColumnFn)
)
check(
  "소유자를 auth.uid() 로 확인한다",
  computedColumnFn !== null && computedColumnFn.includes("ta.parent_id = auth.uid()")
)
check(
  // composite 인자는 호출자가 만들어 넣을 수 있다. 그 안의 parent_id 를 판정
  // 근거로 쓰면 자기 id 를 적어 넣는 것만으로 남의 결과를 알 수 있다.
  "인자로 받은 $1.parent_id 를 믿지 않는다",
  computedColumnFn !== null && !computedColumnFn.includes("$1.parent_id")
)
check(
  "결과 존재 확인이 그 신청으로 한정된다",
  computedColumnFn !== null && computedColumnFn.includes("rr.application_id = ta.id")
)
check(
  // auth.uid() 가 null 이면 위 비교가 성립하지 않아 false 다. 별도 분기를 두지
  // 않는 것이 맞다 — 분기가 늘면 빠뜨릴 자리도 는다.
  "미인증이면 조건이 성립하지 않는다",
  computedColumnFn !== null &&
    !/coalesce\(auth\.uid\(\)/.test(computedColumnFn) &&
    computedColumnFn.includes("auth.uid()")
)
check(
  "computed column 이 anon 에서 명시적으로 거둬진다",
  /revoke all on function public\.has_current_registration_result[^;]*from public;/.test(migrationSql) &&
    /revoke all on function public\.has_current_registration_result[^;]*from anon;/.test(migrationSql) &&
    !/grant execute on function public\.has_current_registration_result[^;]*to anon/.test(migrationSql)
)
check(
  "동기화 함수도 anon / authenticated 에 열려 있지 않다",
  /revoke all on function public\.sync_registration_result\(\) from anon;/.test(migrationSql) &&
    /revoke all on function public\.sync_registration_result\(\) from authenticated;/.test(migrationSql) &&
    !/grant execute on function public\.sync_registration_result/.test(migrationSql)
)
check(
  "학부모 registration_results SELECT 정책이 0개다",
  policyStatements.filter((policy) => policy.includes("auth.uid()")).length === 0
)
const parentDtoBlock = (() => {
  const start = read(ADAPTER_PATH).indexOf("export type ParentApplicationSummary = {")
  const rest = read(ADAPTER_PATH).slice(start)
  return rest.slice(0, rest.indexOf("\n}\n") + 3)
})()
check("학부모 DTO 에 registrationStatus 가 없다", !parentDtoBlock.includes("registrationStatus"))
check("학부모 DTO 에 registrationResult 가 없다", !parentDtoBlock.includes("registrationResult"))
check("학부모 DTO 에 resolvedAt 이 없다", !parentDtoBlock.includes("resolvedAt"))
check("학부모 DTO 는 boolean 하나만 갖는다", parentDtoBlock.includes("canCollectParentDecision: boolean"))

console.log("\n── 11. adapter 양쪽이 같다 ──")
check(
  "양쪽에 같은 표면이 있다",
  ["getCurrentRegistrationResult"].every(
    (method) => supabaseAdapter.includes(method) && mockAdapter.includes(method) && read(ADAPTER_PATH).includes(method)
  )
)
check("결과 요약 타입이 raw row 가 아니다", lib.includes("export type RegistrationResultSummary"))

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
