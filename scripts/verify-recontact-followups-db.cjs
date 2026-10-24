// 학생 안내 문자 후속(20261025120000) DB 검증.
//
// 로컬 Supabase(docker 컨테이너 supabase_db_<project_id>)의 psql 로만 돈다. 연결 문자열을 받지 않는다 —
// 운영 DB 에 닿을 길이 없다. 모든 변경은 scripts/verify-recontact-followups-db.sql 안에서 ROLLBACK 된다.
//
// 로컬 DB 에 20261025120000 이 아직 없으면 migration 본문을 같은 transaction 안에 넣어 적용 → 검증 → ROLLBACK 하고,
// 끝난 뒤 새 표 · 새 함수가 남지 않았는지 본다(롤백 검증). 이미 적용돼 있으면 검증만 한다.
//
// 준비: supabase db reset --local --no-seed   (20261024120000 이상)
// 실행: node scripts/verify-recontact-followups-db.cjs
const cp = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")

const repo = path.resolve(__dirname, "..")
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(repo, "supabase/config.toml"), "utf8"))?.[1]
if (!projectId) throw new Error("supabase/config.toml project_id 를 찾지 못했습니다")
const container = `supabase_db_${projectId}`

const running = cp.execFileSync("docker", ["ps", "--format", "{{.Names}}"], { encoding: "utf8" }).split("\n")
if (!running.includes(container)) {
  console.error(`로컬 DB 컨테이너(${container})가 없습니다. supabase start 후 다시 실행하세요.`)
  process.exit(1)
}

const query = (sql) => cp.execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-tAc", sql], { encoding: "utf8" }).trim()
const hasVersion = (version) => query(`select exists(select 1 from supabase_migrations.schema_migrations where version = '${version}')`) === "t"

if (!hasVersion("20261024120000")) {
  console.error("로컬 DB 에 20261024120000 이 없습니다. supabase db reset --local --no-seed 를 먼저 실행하세요.")
  process.exit(1)
}
const inline = !hasVersion("20261025120000")
const migration = fs.readFileSync(path.join(repo, "supabase/migrations/20261025120000_recontact_followups.sql"), "utf8")
const template = fs.readFileSync(path.join(__dirname, "verify-recontact-followups-db.sql"), "utf8")
// 함수 치환: 문자열 치환은 본문의 $$ 를 $ 로 바꾼다.
const sql = template.replace("-- :MIGRATION", () => (inline ? migration : "-- (20261025120000 은 이미 적용돼 있다)"))
console.log(inline ? "모드: migration 을 transaction 안에서 적용 → 검증 → ROLLBACK" : "모드: 이미 적용된 DB 에서 검증만")

const result = cp.spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-tA", "-q"], { input: sql, encoding: "utf8" })
if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(1)
}

const lines = result.stdout.split("\n").filter((line) => /^(PASS|FAIL|ROLLED_BACK)\|/.test(line))
for (const line of lines) console.log(line.replace("|", " "))
const failed = lines.filter((line) => line.startsWith("FAIL|"))
let rolledBack = lines.includes("ROLLED_BACK|true")

if (inline) {
  // 롤백 뒤에 migration 흔적이 남지 않았는가
  const leftovers = query(`select concat_ws(',',
    case when to_regclass('public.marketing_consent_notices') is not null then 'marketing_consent_notices' end,
    case when to_regprocedure('app.recontact_account_phone(uuid)') is not null then 'app.recontact_account_phone' end,
    case when to_regprocedure('public.list_studio_recontact_phone_ready(uuid[])') is not null then 'list_studio_recontact_phone_ready' end,
    case when exists(select 1 from information_schema.columns where table_name = 'recontact_recipients' and column_name = 'result_checked_at') then 'recontact_recipients.result_checked_at' end,
    case when pg_get_constraintdef((select oid from pg_constraint where conname = 'recontact_recipients_status_check')) like '%opted_out%' then 'status opted_out' end,
    case when (select prosrc from pg_proc where oid = 'public.set_my_academy_marketing_consent(uuid,boolean,text,text)'::regprocedure) like '%changed%' then 'consent changed' end)`)
  const clean = leftovers === ""
  console.log(`${clean ? "PASS" : "FAIL"} 롤백 뒤 migration 흔적 없음${clean ? "" : `  (${leftovers})`}`)
  rolledBack = rolledBack && clean
}

const passed = lines.filter((line) => line.startsWith("PASS|")).length
console.log(`\n${passed} PASS · ${failed.length} FAIL · rollback ${rolledBack ? "OK" : "확인 안 됨"}`)
process.exit(failed.length === 0 && rolledBack && passed > 0 ? 0 : 1)
