// 로컬 개발 서버가 운영 DB 를 볼 때 결제 · 문자 실행을 막는 가드 검증.
//
//   npx tsx scripts/verify-billing-local-guard.ts
//
// 여기서 고정하는 것.
//   1. development + 호스팅 DB 주소 → blocked(hosted_database_in_development)
//   2. development + 로컬 DB 주소 → allowed
//   3. development + 호스팅 DB + BILLING_LOCAL_ALLOW=1 → allowed (명시적으로 연 경우만)
//   4. production · preview 판정은 DB 주소와 무관하게 바뀌지 않는다
//   5. 모르는 주소(빈 값 · 잘못된 형식)는 로컬로 보지 않는다(fail closed)
//   6. 결제 env(getTossBillingEnv)가 이 가드를 실제로 거친다(소스 계약)
//
// 순수 함수와 소스 텍스트만 본다. DB · 네트워크 · process.env 를 건드리지 않는다.

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { isLocalDatabaseUrl, resolveLocalMutationGuard } from "@/shared/config/local-mutation-guard"

let failures = 0

const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) {
    failures += 1
  }
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`)
}

const describe = (guard: ReturnType<typeof resolveLocalMutationGuard>) =>
  guard.allowed ? "allowed" : `blocked(${guard.code})`

const HOSTED = "https://abcdefghijklmnop.supabase.co"
const LOCAL = "http://127.0.0.1:54321"

// 1~3. development
check(
  "development + 호스팅 DB → 막힌다",
  describe(resolveLocalMutationGuard({ deployment: "development", databaseUrl: HOSTED, localAllow: false })) ===
    "blocked(hosted_database_in_development)"
)
check(
  "development + 로컬 DB → 열린다",
  describe(resolveLocalMutationGuard({ deployment: "development", databaseUrl: LOCAL, localAllow: false })) === "allowed"
)
check(
  "development + localhost DB → 열린다",
  describe(resolveLocalMutationGuard({ deployment: "development", databaseUrl: "http://localhost:54321", localAllow: false })) ===
    "allowed"
)
check(
  "development + 호스팅 DB + BILLING_LOCAL_ALLOW=1 → 열린다",
  describe(resolveLocalMutationGuard({ deployment: "development", databaseUrl: HOSTED, localAllow: true })) === "allowed"
)
check(
  "development + DB 주소 없음 → 막힌다",
  describe(resolveLocalMutationGuard({ deployment: "development", databaseUrl: null, localAllow: false })) ===
    "blocked(hosted_database_in_development)"
)

// 4. production · preview
for (const deployment of ["production", "preview"] as const) {
  check(
    `${deployment} + 호스팅 DB → 가드는 관여하지 않는다`,
    describe(resolveLocalMutationGuard({ deployment, databaseUrl: HOSTED, localAllow: false })) === "allowed"
  )
}

// 5. 주소 판정
check("supabase.co 는 로컬이 아니다", !isLocalDatabaseUrl(HOSTED))
check("127.0.0.1 은 로컬이다", isLocalDatabaseUrl(LOCAL))
check("[::1] 은 로컬이다", isLocalDatabaseUrl("http://[::1]:54321"))
check("빈 값은 로컬이 아니다", !isLocalDatabaseUrl(""))
check("잘못된 형식은 로컬이 아니다", !isLocalDatabaseUrl("127.0.0.1:54321/oops"))
check("호스트 이름에 localhost 가 섞인 외부 주소는 로컬이 아니다", !isLocalDatabaseUrl("https://localhost.evil.example"))

// 6. 소스 계약
const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

const serverEnv = read("src/shared/config/server-env.ts")
const guardIndex = serverEnv.indexOf("getLocalMutationGuard()")
const readyIndex = serverEnv.lastIndexOf('status: "ready"')
check(
  "getTossBillingEnv 가 ready 를 돌려주기 전에 가드를 본다",
  guardIndex > 0 && readyIndex > guardIndex
)
check("BILLING_LOCAL_ALLOW 는 정확히 1 일 때만 연다", serverEnv.includes('process.env.BILLING_LOCAL_ALLOW?.trim() === "1"'))

if (failures > 0) {
  console.error(`FAIL: 로컬 안전 가드 검증 실패 ${failures}건`)
  process.exit(1)
}

console.log("PASS: 로컬 안전 가드 검증 완료")
