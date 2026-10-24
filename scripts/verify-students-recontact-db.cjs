// 2차-3 학생 · 안내 보내기 DB 검증.
//
// 로컬 Supabase(docker 컨테이너 supabase_db_<project_id>)의 psql 로만 돈다. 연결 문자열을 받지 않는다 —
// 운영 DB 에 닿을 길이 없다. 모든 변경은 scripts/verify-students-recontact-db.sql 안에서 ROLLBACK 된다.
//
// 준비: supabase db reset --local --no-seed   (20261024120000 까지 적용)
// 실행: node scripts/verify-students-recontact-db.cjs
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

const applied = cp.execFileSync("docker", ["exec", container, "psql", "-U", "postgres", "-tAc",
  "select exists(select 1 from supabase_migrations.schema_migrations where version = '20261024120000')"], { encoding: "utf8" }).trim()
if (applied !== "t") {
  console.error("로컬 DB 에 20261024120000 이 없습니다. supabase db reset --local --no-seed 를 먼저 실행하세요.")
  process.exit(1)
}

const sql = fs.readFileSync(path.join(__dirname, "verify-students-recontact-db.sql"), "utf8")
const result = cp.spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-tA", "-q"], { input: sql, encoding: "utf8" })
if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(1)
}

const lines = result.stdout.split("\n").filter((line) => /^(PASS|FAIL|ROLLED_BACK)\|/.test(line))
for (const line of lines) console.log(line.replace("|", " "))
const failed = lines.filter((line) => line.startsWith("FAIL|"))
const rolledBack = lines.includes("ROLLED_BACK|true")
const passed = lines.filter((line) => line.startsWith("PASS|")).length
console.log(`\n${passed} PASS · ${failed.length} FAIL · rollback ${rolledBack ? "OK" : "확인 안 됨"}`)
process.exit(failed.length === 0 && rolledBack && passed > 0 ? 0 : 1)
