// 학부모 선택(ParentDecision)의 계약 검증.
//
//   npx tsx scripts/verify-parent-decision.ts
//
// 여기서 고정하는 것.
//   1. 값은 planned / considering / declined 셋뿐이다.
//   2. 등록 결과(enrolled / not_enrolled)와 이름이 겹치지 않는다.
//   3. registration_status 를 ParentDecision 으로 변환하지 않는다.
//   4. 표시 여부 판정이 registration_status 를 학부모에게 흘리지 않는다.
//   5. 과거 기록은 고칠 수 없다.
//   6. 쓰기는 RPC 로만 들어온다.
//   7. 학원은 읽기만 한다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  PARENT_DECISION_OPTIONS,
  PARENT_DECISION_VALUES,
  canCollectParentDecision,
  getParentDecisionLabel,
  isParentDecision
} from "@/features/decisions/lib/parent-decision"

const MIGRATION_PATH = "supabase/migrations/20260915090000_create_parent_decisions.sql"
const ADAPTER_PATH = "src/shared/lib/db/supabase-adapter.ts"
const MOCK_PATH = "src/shared/lib/db/mock-adapter.ts"
const ACTION_PATH = "src/features/decisions/actions/set-parent-decision.ts"
const QUERY_PATH = "src/features/decisions/queries/get-my-current-parent-decision.ts"
const PARENT_UI_PATH = "src/features/decisions/ui/parent-decision-form.tsx"
const STUDIO_UI_PATH = "src/features/decisions/ui/studio-parent-decision.tsx"
const DETAIL_PAGE_PATH = "app/record/[experienceId]/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

const migration = read(MIGRATION_PATH)
const action = read(ACTION_PATH)
const query = read(QUERY_PATH)
const parentUi = read(PARENT_UI_PATH)
const studioUi = read(STUDIO_UI_PATH)
const detailPage = read(DETAIL_PAGE_PATH)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("── 1. 값은 셋뿐이다 ──")
check("선택지가 3개다", PARENT_DECISION_OPTIONS.length === 3, `actual ${PARENT_DECISION_OPTIONS.length}`)
for (const value of ["planned", "considering", "declined"]) {
  check(`${value} 포함`, PARENT_DECISION_VALUES.has(value))
  check(`migration CHECK 에 ${value}`, migration.includes(`'${value}'`))
}
check("값에 중복이 없다", PARENT_DECISION_VALUES.size === 3)
check(
  "모든 값에 학부모 문구가 있다",
  PARENT_DECISION_OPTIONS.every((option) => getParentDecisionLabel(option.value).length > 0)
)

console.log("\n── 2. 등록 결과와 이름이 겹치지 않는다 ──")
// enrolled / not_enrolled 는 학원이 적는 운영 값이다. 학부모 의향에 쓰지 않는다.
for (const forbidden of ["enrolled", "not_enrolled"]) {
  check(`${forbidden} 는 선택지가 아니다`, !PARENT_DECISION_VALUES.has(forbidden))
  check(`${forbidden} 를 받지 않는다`, !isParentDecision(forbidden))
}
check("undecided 도 받지 않는다", !isParentDecision("undecided"))
check("pending 도 받지 않는다", !isParentDecision("pending"))
check(
  "migration CHECK 가 등록 결과 값을 허용하지 않는다",
  /check \(decision in \('planned', 'considering', 'declined'\)\)/.test(migration)
)

console.log("\n── 3. registration_status 를 변환하지 않는다 ──")
// pending → considering 같은 자동 변환은 변환이 아니라 창작이다.
check(
  "migration 에 backfill INSERT 가 없다",
  !/insert into public\.parent_decisions[\s\S]{0,400}from public\.trial_applications/i.test(migration)
)
// 주석과 comment on 문은 검사 대상이 아니다 — 두 값을 왜 분리하는지 적어 둔 설명이다.
// 실제로 읽는지만 본다.
const migrationSql = migration
  .replace(/--[^\n]*/g, "")
  .replace(/comment on [\s\S]*?;/gi, "")
check(
  "migration 이 registration_status 를 읽지 않는다",
  !migrationSql.includes("registration_status"),
  migrationSql.includes("registration_status") ? "실행 SQL 에서 참조됨" : ""
)
check("adapter 가 변환 표를 두지 않는다", !read(ADAPTER_PATH).includes("pending: \"considering\""))

console.log("\n── 4. 표시 판정이 학부모에게 값을 흘리지 않는다 ──")
check("enrolled 면 묻지 않는다", canCollectParentDecision("enrolled") === false)
check("not_enrolled 면 묻지 않는다", canCollectParentDecision("not_enrolled") === false)
check("pending 이면 묻는다", canCollectParentDecision("pending") === true)
check("undecided 면 묻는다", canCollectParentDecision("undecided") === true)
check("값이 없어도 묻는다", canCollectParentDecision(null) === true)
check(
  "학부모 화면이 boolean 만 본다",
  detailPage.includes("experience.canCollectParentDecision") &&
    !stripComments(detailPage).includes("registrationStatus")
)
check(
  "판정이 ParentDecision 을 만들지 않는다",
  !stripComments(read("src/features/decisions/lib/parent-decision.ts")).includes("insert")
)

console.log("\n── 5. 과거 기록은 고칠 수 없다 ──")
check("immutability trigger 가 있다", migration.includes("parent_decisions_immutable"))
for (const column of ["id", "application_id", "parent_id", "decision", "created_at"]) {
  check(`trigger 가 ${column} 변경을 막는다`, migration.includes(`new.${column} is distinct from old.${column}`))
}
check(
  "지나간 기록을 현재로 되돌릴 수 없다",
  migration.includes("old.superseded_at is not null and new.superseded_at is null")
)
check(
  "현재 기록은 한 신청에 하나다",
  /create unique index[\s\S]*?on public\.parent_decisions \(application_id\)[\s\S]*?where superseded_at is null/i.test(
    migration
  )
)

console.log("\n── 6. 쓰기는 RPC 로만 ──")
const policyBlocks = migration
  .split("create policy ")
  .slice(1)
  .map((block) => block.slice(0, block.indexOf(";")))
check("정책이 2개다", policyBlocks.length === 2, `actual ${policyBlocks.length}`)
check("모든 정책이 select 전용이다", policyBlocks.every((block) => /\bfor select\b/.test(block)))
check(
  "insert / update / delete 정책이 없다",
  policyBlocks.every((block) => !/\bfor (insert|update|delete)\b/.test(block))
)
check("RLS 를 켠다", migration.includes("alter table public.parent_decisions enable row level security"))
check("RPC 가 정의자 권한이다", migration.includes("security definer"))
check("search_path 를 고정한다", migration.includes("set search_path = public"))
check("PUBLIC 실행 권한을 회수한다", migration.includes("revoke all on function public.set_parent_decision(uuid, text) from public"))
check("anon 실행 권한을 회수한다", migration.includes("revoke execute on function public.set_parent_decision(uuid, text) from anon"))
check("authenticated 에게만 준다", migration.includes("grant execute on function public.set_parent_decision(uuid, text) to authenticated"))
check("parent_id 를 파라미터로 받지 않는다", !/p_parent_id/.test(migration))
check("parent_id 를 auth.uid() 로 채운다", migration.includes("v_actor uuid := auth.uid()"))
check("대상 신청을 잠근다", migration.includes("for update of ta"))
check("현재 기록도 잠근다", /from public\.parent_decisions pd[\s\S]*?for update;/.test(migration))
check("본인 신청만 고를 수 있다", migration.includes("ta.parent_id = v_actor"))
check("체험 완료 후에만", migration.includes("application_not_completed"))
check("존재 여부를 흘리지 않는다", migration.includes("application_not_found_or_forbidden"))
check(
  "같은 값 재선택은 기록을 늘리지 않는다",
  migration.includes("v_current.decision = p_decision") && migration.includes("'changed', false")
)

console.log("\n── 7. 학원은 읽기만 한다 ──")
check("학원 정책이 조직 scope 다", migration.includes("c.organization_id = app.current_org_id()"))
check("학부모 정책이 본인 scope 다", migration.includes("ta.parent_id = auth.uid()"))
check("Studio 화면에 수정 경로가 없다", !studioUi.includes("setParentDecision") && !studioUi.includes("<button"))
check(
  "Studio 화면이 읽기 전용이라고 말한다",
  studioUi.includes("학원에서 수정할 수 없습니다")
)
check("선택이 없으면 조용히 알린다", studioUi.includes("아직 학부모가 선택을 남기지 않았습니다"))

console.log("\n── 8. 화면·action 계약 ──")
check("action 이 학부모 인증을 요구한다", action.includes("requireParentAccess("))
check("action 이 값을 검증한다", action.includes("isParentDecision(decision)"))
check("action 이 원문 오류를 그대로 올리지 않는다", action.includes("선택을 저장하지 못했습니다"))
check("action 이 캐시를 되살린다", action.includes("revalidatePath("))
check("query 가 소유 확인을 먼저 한다", query.indexOf("getMyExperienceDetail") < query.indexOf("getCurrentParentDecision"))
check(
  "조회 실패를 '선택 없음' 으로 접지 않는다",
  query.includes('status: "error"') && query.includes('status: "not_found"')
)
check("강제 선택이 아니다", !parentUi.includes("required"))
check("modal 이 아니다", !parentUi.includes('role="dialog"'))
check("나중에 바꿀 수 있다고 말한다", parentUi.includes("현재 생각은 나중에 바꿀 수 있어요"))
check("색만으로 선택을 말하지 않는다", parentUi.includes("aria-pressed") && parentUi.includes("optionMark"))
check("mock 도 같은 판정을 한다", read(MOCK_PATH).includes('throw new Error("application_not_completed")'))
check(
  "adapter 양쪽에 같은 표면이 있다",
  ["getCurrentParentDecision", "setParentDecision"].every(
    (method) => read(ADAPTER_PATH).includes(method) && read(MOCK_PATH).includes(method)
  )
)

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`)
process.exit(failures === 0 ? 0 : 1)
