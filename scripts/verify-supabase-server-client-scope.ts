// Supabase server client 의 수명 검증.
//
//   npx tsx scripts/verify-supabase-server-client-scope.ts
//
// 왜 필요한가.
//   예전에는 getSupabaseServerClient() 를 부를 때마다 새 client 를 만들었다.
//   Home 한 번 그리는 데 auth · profile · 신청 · 자녀 · 할 일 조회가 각자 client 를
//   만들어 동시에 떴고, access token 이 만료에 가까우면 그것들이 같은 refresh token 으로
//   제각각 refresh 를 시도했다. Supabase 는 refresh 할 때 token 을 rotate 하므로
//   하나가 이기면 나머지는 폐기된 token 을 들고 세션을 잃었다. 세션을 잃은 client 의
//   질의는 RLS 에서 auth.uid() 가 풀리지 않아 어떤 것은 에러 없이 0 rows,
//   어떤 것은 에러로 돌아왔다. 같은 요청인데 조회마다 결과가 달랐다.
//
// 여기서 고정하는 것.
//   A. getSupabaseServerClient 는 React cache() 로 감싸여 있다.
//   B. module-level mutable singleton 이 없다(사용자 간 client 공유 금지).
//   C. cookie getAll / setAll 계약이 그대로다.
//   D. createServerClient 호출이 memoized factory 안에 있다.
//   E. middleware matcher 의 Parent 범위를 넓히지 않았다.
//   F. profile_missing 을 학부모로 강제하지 않는다.
//   G. profile retry · sleep · setTimeout 우회가 남아 있지 않다.
//
// 소스 계약 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const SERVER = "src/integrations/supabase/server.ts"
const MIDDLEWARE_CLIENT = "src/integrations/supabase/middleware.ts"
const MIDDLEWARE = "middleware.ts"
const PROFILE_SYNC = "src/features/auth/lib/profile-sync.ts"
const HOME = "app/page.tsx"
const SESSION = "src/features/auth/lib/session.ts"
const CURRENT_AUTH = "src/features/auth/lib/current-auth.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")

const server = read(SERVER)
const serverCode = stripComments(server)
const middleware = stripComments(read(MIDDLEWARE))
const profileSync = stripComments(read(PROFILE_SYNC))
const home = stripComments(read(HOME))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("[A] 요청 범위 memoization")

check('A) react 의 cache 를 들여온다', serverCode.includes('import { cache } from "react"'))
check(
  "A) getSupabaseServerClient 가 cache() 로 감싸여 있다",
  /export const getSupabaseServerClient = cache\(/.test(serverCode)
)
/* 인자가 없어야 요청당 하나로 모인다. 인자를 받으면 인자마다 새 client 가 된다. */
check(
  "A) 인자를 받지 않는다(요청당 하나로 모인다)",
  /export const getSupabaseServerClient = cache\(async \(\): Promise<SupabaseClient> => \{/.test(serverCode)
)
/* 이 저장소가 이미 쓰는 것과 같은 패턴인지 확인한다. */
for (const path of [SESSION, CURRENT_AUTH, PROFILE_SYNC]) {
  check(`A) ${path} 도 같은 cache() 패턴이다(대조군)`, read(path).includes('import { cache } from "react"'))
}

console.log("\n[B] singleton 금지")

/* 프로세스 수명 동안 살아남는 client 는 다른 사용자의 세션을 물려준다. */
check("B) module-level mutable 변수가 없다", !/^(let|var)\s/m.test(serverCode))
check("B) globalThis 에 담지 않는다", !serverCode.includes("globalThis") && !/\bglobal\./.test(serverCode))
check(
  "B) singleton 이름을 쓰지 않는다",
  !/singleton|cachedClient|sharedClient|clientInstance/i.test(serverCode)
)
/* service-role client 는 별개 경로다. 여기 섞이지 않았는지 본다. */
check("B) service-role 을 이 경로로 끌어오지 않았다", !serverCode.includes("SERVICE_ROLE"))

console.log("\n[C] cookie 계약 유지")

check("C) getAll 이 그대로다", serverCode.includes("getAll()") && serverCode.includes("cookieStore.getAll()"))
check("C) setAll 이 그대로다", serverCode.includes("setAll("))
check("C) cookieStore.set 을 계속 시도한다", serverCode.includes("cookieStore.set(cookie.name, cookie.value, cookie.options)"))
/* Server Component 에서 cookie 를 못 쓰는 경우를 삼키던 처리도 그대로다. */
check("C) set 실패를 삼키는 기존 처리가 남아 있다", /\}\s*catch\s*\{/.test(serverCode))
check("C) cookie 이름 규칙을 바꾸지 않았다", server.includes("sb-") )
check("C) 공개 key 를 그대로 쓴다", serverCode.includes("supabasePublishableKey"))

console.log("\n[D] createServerClient 위치")

const factory = /export const getSupabaseServerClient = cache\(([\s\S]*?)\n\}\)/.exec(serverCode)?.[1] ?? ""
check("D) memoized factory 안에서 client 를 만든다", factory.includes("createServerClient("))
check(
  "D) factory 밖에 다른 createServerClient 가 없다",
  (serverCode.match(/createServerClient\(/g) ?? []).length === 1,
  String((serverCode.match(/createServerClient\(/g) ?? []).length)
)
/* middleware 용 client 는 요청마다 새로 만들어야 한다. 거기까지 memoize 하지 않는다. */
check(
  "D) middleware client 는 건드리지 않았다",
  !stripComments(read(MIDDLEWARE_CLIENT)).includes("cache(")
)

console.log("\n[E] 이번 fix 의 범위")

/* S3B 에서 Studio host 조건부 항목이 붙었다. Parent 범위는 그대로여야 한다. */
const matcherBlock = middleware.slice(middleware.indexOf("matcher: ["))
check(
  "E) Parent matcher 를 넓히지 않았다",
  ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
    matcherBlock.split("\n").some((row) => row.trim() === `"${source}",`)
  )
)
check(
  "E) 조건 없는 광역 matcher 가 없다",
  !matcherBlock.includes('"/:path*"') && !matcherBlock.includes('"/(.*)"')
)
/* 넓은 경로는 Studio host 조건이 붙은 항목에만 허용한다. */
for (const row of matcherBlock.split("\n")) {
  if (!row.includes("source:")) continue
  check("E) 넓은 matcher 항목에 host 조건이 붙어 있다", row.includes('has: [{ type: "host"'), row.trim())
}
for (const route of ['"/"', '"/notifications', '"/favorites"', '"/record/:path*"', '"/academies"']) {
  check(`E) matcher 에 ${route} 를 넣지 않았다`, !middleware.includes(`matcher: [${route}`) && !middleware.includes(`, ${route}`))
}

console.log("\n[F][G] 앞선 가설의 우회가 남지 않았다")

check('F) Home 이 "profile_missing" 을 학부모로 보지 않는다', !home.includes("profile_missing"))
check(
  "F) Home gate 는 isParentUser 로만 연다",
  /authenticated && isParentUser \? await getParentHomeSummary\(/.test(home.replace(/\s+/g, " "))
)
/* 빈 결과를 다시 읽어 보던 실험은 원인이 아니었다. 되돌아왔는지 확인한다. */
check(
  "G) profile 조회는 에러일 때만 재시도한다(원래 계약)",
  profileSync.includes("if (!firstAttempt.error) {") &&
    !profileSync.includes("isConclusiveProfileAttempt")
)
check("G) 조회 호출은 두 곳뿐이다", (profileSync.match(/await runQuery\(\)/g) ?? []).length === 2)
check("G) sleep · setTimeout 우회가 없다", !profileSync.includes("setTimeout") && !serverCode.includes("setTimeout"))
check(
  "G) 실험용 verifier 가 남아 있지 않다",
  !existsSync(resolve(process.cwd(), "scripts/verify-parent-profile-resolution.ts"))
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
