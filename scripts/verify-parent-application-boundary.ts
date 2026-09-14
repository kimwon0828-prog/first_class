// 학부모가 신청 데이터를 읽을 수 있는 범위의 계약 검증.
//
//   npx tsx scripts/verify-parent-application-boundary.ts
//
// 여기서 고정하는 것.
//   1. 학부모 credential 로 trial_applications base table 을 읽을 수 없다.
//   2. 학부모가 읽는 표면은 my_trial_applications 하나다.
//   3. 그 표면에 학원 내부 운영 column 이 없다.
//   4. 등록 결과 원본도 없다 — boolean 으로만 나간다.
//   5. 소유권은 DB 안에서 auth.uid() 로 판정한다.
//   6. 학원 표면은 자기 조직으로 제한된다.
//   7. anon 에게는 어떤 표면도 열려 있지 않다.
//   8. 코드가 학부모 경로에서 base table 을 다시 열지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const MIGRATION_PATH =
  "supabase/migrations/20260915090000_enforce_parent_application_read_boundary.sql"
const ADAPTER_PATH = "src/shared/lib/db/adapter.ts"
const SUPABASE_ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const CANCEL_ACTION_PATH = "src/features/applications/actions/cancel-my-application.ts"
const STUDIO_CASES_PATH = "src/features/studio/queries/get-studio-cases.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripSqlComments = (sql: string) => sql.replace(/^\s*--[^\n]*$/gm, "")
const stripCommentOn = (sql: string) => sql.replace(/comment on [\s\S]*?;/gi, "")
const stripTsComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const migration = read(MIGRATION_PATH)
const migrationSql = stripCommentOn(stripSqlComments(migration))
const supabaseAdapter = read(SUPABASE_ADAPTER_PATH)
const supabaseAdapterCode = stripTsComments(supabaseAdapter)
const cancelAction = stripTsComments(read(CANCEL_ACTION_PATH))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

/** view 정의 하나를 떼어 온다. 다른 view 의 본문이 섞이지 않게 `;` 로 끊는다. */
const extractView = (name: string) => {
  const start = migrationSql.indexOf(`create or replace view public.${name} as`)
  if (start === -1) return null
  const rest = migrationSql.slice(start)
  const end = rest.indexOf(";")
  return end === -1 ? rest : rest.slice(0, end)
}

/** security definer 함수 본문. $$ 로 끊는다 — 본문 안의 `;` 에 걸리지 않게. */
const extractFunctionBody = (name: string) => {
  const start = migrationSql.indexOf(`create or replace function public.${name}`)
  if (start === -1) return null
  const rest = migrationSql.slice(start)
  const open = rest.indexOf("$$")
  if (open === -1) return null
  const close = rest.indexOf("$$", open + 2)
  return close === -1 ? rest : rest.slice(0, close + 2)
}

const parentView = extractView("my_trial_applications")
const studioView = extractView("studio_trial_applications")

/**
 * 학부모 표면에 절대 들어오면 안 되는 값.
 *
 * 학원이 적는 운영 값과 내부 timestamp 다. 여기 하나라도 들어오면 이 단계가
 * 막으려던 것이 그대로 다시 열린다.
 */
const FORBIDDEN_PARENT_COLUMNS = [
  "registration_status",
  "registered_course",
  "unregistered_reason",
  "unregistered_reason_note",
  "enrolled_at",
  "lost_at",
  "consultation_note",
  "trial_feedback",
  "final_level",
  "final_schedule",
  "follow_up_note",
  "next_contact_at",
  "last_activity_at",
  "assigned_teacher_id",
  "memo",
  "regular_schedule_preference",
  "no_show_at",
  "contacted_at"
]

console.log("── 1. base table 이 닫혀 있다 ──")
check(
  "authenticated 에서 table 권한을 거둔다",
  /revoke all on table public\.trial_applications from authenticated;/.test(migrationSql)
)
check(
  "anon 에서도 거둔다",
  /revoke all on table public\.trial_applications from anon;/.test(migrationSql)
)
check(
  "다시 열어 주는 SELECT grant 가 없다",
  !/grant[^;]*select[^;]*on table public\.trial_applications[^;]*to (authenticated|anon|public)/i.test(
    migrationSql
  )
)
check(
  "학부모가 남기는 권한은 INSERT 하나다",
  /grant insert on table public\.trial_applications to authenticated;/.test(migrationSql) &&
    !/grant (select|update|delete|all)[^;]*on table public\.trial_applications to authenticated/i.test(
      migrationSql
    )
)
check(
  "column 단위로 우회해 열지 않는다",
  !/grant[^;]*\([^)]*\)[^;]*on table public\.trial_applications/i.test(migrationSql)
)

console.log("\n── 2. 학부모 표면은 하나다 ──")
check("my_trial_applications 를 만든다", parentView !== null)
check(
  "학부모 표면이 authenticated 에 SELECT 로만 열린다",
  /grant select on public\.my_trial_applications to authenticated;/.test(migrationSql) &&
    !/grant[^;]*(insert|update|delete)[^;]*on public\.my_trial_applications/i.test(migrationSql)
)
check(
  "default privilege 를 먼저 거둔다",
  /revoke all on public\.my_trial_applications from anon;/.test(migrationSql) &&
    /revoke all on public\.my_trial_applications from public;/.test(migrationSql)
)
check(
  "학부모 경로가 base table 을 읽지 않는다",
  !/from\("trial_applications"\)\s*\n\s*\.select/.test(
    supabaseAdapterCode.slice(
      supabaseAdapterCode.indexOf("async listMyApplications"),
      supabaseAdapterCode.indexOf("async listStudioApplications")
    )
  )
)
check(
  "listMyApplications 가 학부모 표면을 쓴다",
  supabaseAdapterCode.includes('.from("my_trial_applications")')
)
check(
  "취소 경로도 학부모 표면을 쓴다",
  cancelAction.includes('.from("my_trial_applications")')
)

console.log("\n── 3. 학원 내부 column 이 표면에 없다 ──")
// 내보내는 column 목록만 본다.
//
// 값을 "꺼내 쓰는 것" 과 "내보내는 것" 은 다르다. can_cancel 은 안에서
// registration_status 를 보고 만들지만 그 원본은 밖으로 나가지 않는다 —
// 원본을 감추려고 만든 값이 원본을 언급한다는 이유로 걸리면 안 된다.
// 그래서 bare projection(ta.col) 과 alias(as col) 만 금지한다.
for (const column of FORBIDDEN_PARENT_COLUMNS) {
  const bareProjection = new RegExp(`^\\s*ta\\.${column}\\s*,?\\s*$`, "m")
  const aliased = new RegExp(`\\bas ${column}\\b`)
  check(
    `${column} 를 학부모 표면이 내보내지 않는다`,
    parentView !== null && !bareProjection.test(parentView) && !aliased.test(parentView)
  )
}
check(
  "can_cancel 만이 registration_status 를 쓰는 자리다",
  parentView !== null &&
    (parentView.match(/registration_status/g) ?? []).length === 1 &&
    /ta\.registration_status is distinct from 'enrolled'/.test(parentView)
)
check(
  "취소 판정을 원본 대신 boolean 으로 준다",
  parentView !== null && /as can_cancel/.test(parentView)
)
check(
  "취소 경로가 registration_status 를 읽지 않는다",
  !cancelAction.includes("registration_status:") && !/\.select\([^)]*registration_status/.test(cancelAction)
)

console.log("\n── 4. 등록 결과 원본이 나가지 않는다 ──")
check(
  "결과 존재 여부만 boolean 으로 준다",
  parentView !== null &&
    parentView.includes("public.has_current_registration_result(ta.*) as has_current_registration_result")
)
check(
  "결과값 column 을 붙이지 않는다",
  parentView !== null && !/registration_results/.test(parentView.replace(/has_current_registration_result/g, ""))
)
check(
  "학부모 DTO 에 registrationStatus 가 없다",
  (() => {
    const adapter = read(ADAPTER_PATH)
    const start = adapter.indexOf("export type ParentApplicationSummary = {")
    const block = adapter.slice(start, adapter.indexOf("\n}\n", start))
    return !block.includes("registrationStatus") && !block.includes("registrationResult")
  })()
)
check(
  "생성 직후 계약에도 registrationStatus 가 없다",
  (() => {
    const adapter = read(ADAPTER_PATH)
    const start = adapter.indexOf("export type CreatedTrialApplication = {")
    if (start === -1) return false
    const block = adapter.slice(start, adapter.indexOf("\n}\n", start))
    return !block.includes("registrationStatus")
  })()
)

console.log("\n── 5. 소유권은 DB 안에서 판정한다 ──")
check(
  "학부모 표면이 auth.uid() 로 자기 신청만 고른다",
  parentView !== null && /where ta\.parent_id = auth\.uid\(\)/.test(parentView)
)
check(
  "호출자가 준 값을 소유자 근거로 쓰지 않는다",
  parentView !== null && !/\$1\.parent_id/.test(parentView)
)
const ownFn = extractFunctionBody("is_own_trial_application")
const orgFn = extractFunctionBody("is_org_trial_application")
check("소유 판정 함수가 있다", ownFn !== null)
check(
  "소유 판정이 security definer 다",
  ownFn !== null && /security definer/.test(ownFn) && ownFn.includes("set search_path = public")
)
check(
  "소유 판정이 auth.uid() 를 쓴다",
  ownFn !== null && ownFn.includes("ta.parent_id = auth.uid()")
)
check(
  "중복 확인도 소유권을 안에서 본다",
  (() => {
    const fn = extractFunctionBody("has_active_trial_application")
    return fn !== null && /security definer/.test(fn) && fn.includes("ta.parent_id = auth.uid()")
  })()
)
check(
  "중복 확인이 RPC 로 불린다",
  supabaseAdapterCode.includes('.rpc(\n      "has_active_trial_application"') ||
    supabaseAdapterCode.includes('rpc("has_active_trial_application"')
)
check(
  // 정책 식은 질의하는 사람의 권한으로 평가된다. 거기서 base table 을 직접
  // 읽으면 권한을 거둔 순간 그 정책이 통째로 깨진다.
  "다른 표의 정책이 base table 을 직접 읽지 않는다",
  (() => {
    const policies = migrationSql.match(/create policy[\s\S]*?;/g) ?? []
    return policies.every((policy) => !/from public\.trial_applications|from trial_applications/.test(policy))
  })()
)
check(
  "정책이 판정 함수를 부른다",
  /public\.is_own_trial_application\(/.test(migrationSql) &&
    /public\.is_org_trial_application\(/.test(migrationSql)
)

console.log("\n── 6. 학원 표면은 자기 조직뿐 ──")
check("studio_trial_applications 를 만든다", studioView !== null)
check(
  "teacher 역할을 확인한다",
  studioView !== null && studioView.includes("app.current_role() = 'teacher'")
)
check(
  "자기 조직으로 제한한다",
  studioView !== null && studioView.includes("c.organization_id = app.current_org_id()")
)
check(
  "조직 밖으로 행을 옮기는 쓰기를 막는다",
  studioView !== null && /with check option/.test(studioView)
)
check(
  "학원 표면에 INSERT / DELETE 를 열지 않는다",
  /grant select, update on public\.studio_trial_applications to authenticated;/.test(migrationSql) &&
    !/grant[^;]*(insert|delete)[^;]*on public\.studio_trial_applications/i.test(migrationSql)
)
check(
  "Studio 조회가 학원 표면을 쓴다",
  read(STUDIO_CASES_PATH).includes('.from("studio_trial_applications")')
)
check(
  "Studio adapter 경로도 학원 표면을 쓴다",
  supabaseAdapterCode.includes('.from("studio_trial_applications")')
)

console.log("\n── 7. anon 은 어디에도 닿지 않는다 ──")
for (const surface of ["my_trial_applications", "studio_trial_applications"]) {
  check(
    `${surface} 가 anon 에게 닫혀 있다`,
    new RegExp(`revoke all on public\\.${surface} from anon;`).test(migrationSql) &&
      !new RegExp(`grant[^;]*on public\\.${surface}[^;]*to anon`, "i").test(migrationSql)
  )
}
for (const fn of [
  "has_active_trial_application",
  "is_own_trial_application",
  "is_org_trial_application"
]) {
  check(
    `${fn} 이 anon 에게 닫혀 있다`,
    new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from anon;`).test(migrationSql) &&
      !new RegExp(`grant execute on function public\\.${fn}\\([^)]*\\) to anon`).test(migrationSql)
  )
}

console.log("\n── 8. 남은 base table 접근은 서버 전용뿐 ──")
check(
  // 정원·예약 수는 전체 집계라 호출자 세션으로 세면 답이 달라진다.
  // 행을 돌려주지 않고 개수만 만든다.
  "집계 경로가 service role 로 센다",
  supabaseAdapterCode.includes('await getSupabaseServiceRoleClient()\n        .from("trial_applications")') ||
    supabaseAdapterCode.includes('await getSupabaseServiceRoleClient()\n    .from("trial_applications")')
)
check(
  // RETURNING 이 있으면 INSERT 에도 SELECT 권한이 필요하다. 학부모에게는 없다.
  // data 를 받지 않는 destructuring 이 그 사실을 코드에서 고정한다.
  "신청 생성이 RETURNING 없이 INSERT 한다",
  /const \{ error \} = await supabase\s*\n\s*\.from\("trial_applications"\)\s*\n\s*\.insert\(/.test(
    supabaseAdapterCode
  )
)
check(
  "생성한 신청은 학부모 표면에서 다시 읽는다",
  supabaseAdapterCode.includes('.from("my_trial_applications")')
)
check(
  "상담 transaction 이 호출자 권한에 기대지 않는다",
  /alter function public\.create_studio_consultation\([\s\S]*?\) security definer;/.test(migrationSql)
)
check(
  "데이터를 바꾸지 않는다",
  !/\binsert into public\.trial_applications\b/.test(migrationSql) &&
    !/\bupdate public\.trial_applications\b/.test(migrationSql) &&
    !/\bdelete from\b/.test(migrationSql)
)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
