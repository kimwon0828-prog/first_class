// Studio host 의 공용 auth recovery 경로 검증 (STUDIO SUBDOMAIN S4A).
//
//   npx tsx scripts/verify-studio-auth-recovery-routing.ts
//
// 여기서 고정하는 것.
//   A. Studio /auth/find-email      → 그대로 지나간다
//   B. Studio /auth/reset-password  → 그대로 지나간다
//   C. Studio /auth/recovery        → 그대로 지나간다
//   D. Studio /auth/update-password → 그대로 지나간다
//   E. /auth/sign-in 은 여전히 /studio/sign-in 으로 rewrite 된다
//   F. Parent 의 recovery 흐름은 영향을 받지 않는다
//   G. ?type=academy 가 보존된다
//   H. reset redirectTo 는 window.location.origin 기반 그대로다
//   I. OAuth callback 무변경
//   J. cookie · auth · RLS 무변경
//
// 왜 필요한가 —
//   Studio host 에서 /auth/find-email 을 옮기면 /studio/auth/find-email 이 되는데
//   그런 route 는 없다. 화면이 하나뿐인 자리는 경로도 하나뿐이어야 한다.
//
// 순수 함수 호출 + 소스 검사만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { PARENT_ORIGIN, STUDIO_ORIGIN } from "@/shared/config/site-origins"
import {
  resolveStudioCanonicalRedirectUrl,
  resolveStudioRewritePathname
} from "@/shared/config/studio-host-rewrite"
import { STUDIO_SHARED_AUTH_PATHS, isStudioSharedAuthPath } from "@/shared/config/studio-routes"

const STUDIO_ROUTES = "src/shared/config/studio-routes.ts"
const HOST_REWRITE = "src/shared/config/studio-host-rewrite.ts"
const AUTH_LAYOUT = "app/auth/layout.tsx"
const PROVIDER = "src/features/studio/ui/studio-navigation-provider.tsx"
const MIDDLEWARE = "middleware.ts"
const OAUTH_CALLBACK = "app/auth/callback/route.ts"
const KAKAO_BUTTON = "src/features/auth/ui/kakao-auth-button.tsx"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const SUPABASE_SERVER = "src/integrations/supabase/server.ts"
const RESET_CLIENT = "app/auth/reset-password/reset-password-client.tsx"
const RECOVERY_CLIENT = "app/auth/recovery/recovery-confirm-client.tsx"
const FIND_EMAIL_CLIENT = "app/auth/find-email/find-email-client.tsx"
const UPDATE_PASSWORD = "app/auth/update-password/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const walk = (path: string): string[] => {
  const full = resolve(process.cwd(), path)
  if (!existsSync(full)) return []
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  )
}

const middleware = codeOf(MIDDLEWARE)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}
const equals = (label: string, actual: unknown, expected: unknown) =>
  check(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

const STUDIO_HOST = new URL(STUDIO_ORIGIN).hostname
const PARENT_HOST = new URL(PARENT_ORIGIN).hostname

console.log("[A-D] Studio host 에서 공용 auth 화면은 그대로 지나간다")

const RECOVERY_ROUTES: Array<[string, string]> = [
  ["/auth/find-email", "app/auth/find-email/page.tsx"],
  ["/auth/reset-password", "app/auth/reset-password/page.tsx"],
  ["/auth/recovery", "app/auth/recovery/page.tsx"],
  ["/auth/update-password", "app/auth/update-password/page.tsx"]
]

for (const [pathname, file] of RECOVERY_ROUTES) {
  equals(`A-D) ${STUDIO_HOST}${pathname} → rewrite 없음`, resolveStudioRewritePathname(STUDIO_HOST, pathname), null)
  check(`A-D) ${pathname} route 가 실제로 있다`, exists(file), file)
  /* 옮겼다면 여기로 갔을 자리. 그런 route 는 없다. */
  check(`A-D) /studio${pathname} route 는 없다`, !exists(`app/studio${pathname}/page.tsx`))
  check(`A-D) canonical redirect 대상도 아니다`, resolveStudioCanonicalRedirectUrl(STUDIO_HOST, pathname) === null)
}
/* host 표기가 흔들려도 같은 판단이어야 한다. */
for (const host of [STUDIO_HOST.toUpperCase(), `${STUDIO_HOST}:443`, `${STUDIO_HOST}.`]) {
  equals(`A-D) ${host}/auth/reset-password → rewrite 없음`, resolveStudioRewritePathname(host, "/auth/reset-password"), null)
}
/* trailing slash 로 들어와도 같은 화면이다. */
equals("A-D) /auth/recovery/ 도 그대로다", resolveStudioRewritePathname(STUDIO_HOST, "/auth/recovery/"), null)

console.log("\n[contract] 공용 auth 목록은 contract 에 있다")

check("contract) STUDIO_SHARED_AUTH_PATHS 가 4개다", STUDIO_SHARED_AUTH_PATHS.length === 4, STUDIO_SHARED_AUTH_PATHS.join(", "))
for (const [pathname] of RECOVERY_ROUTES) {
  check(`contract) ${pathname} 가 목록에 있다`, (STUDIO_SHARED_AUTH_PATHS as readonly string[]).includes(pathname))
  check(`contract) isStudioSharedAuthPath(${pathname})`, isStudioSharedAuthPath(pathname))
}
/* Studio 전용 화면은 목록에 없어야 한다. */
for (const pathname of ["/auth/sign-in", "/auth/sign-up", "/auth/sign-out", "/auth/callback", "/classes"]) {
  check(`contract) ${pathname} 는 공용 목록이 아니다`, !isStudioSharedAuthPath(pathname))
}
/* query 가 붙어도 같은 화면으로 알아본다. */
check("contract) query 가 붙어도 알아본다", isStudioSharedAuthPath("/auth/reset-password?type=academy"))
check("contract) 경로를 middleware 에 다시 적지 않았다", !middleware.includes("find-email") && !middleware.includes("reset-password"))
check("contract) rewrite 판단이 contract 를 쓴다", codeOf(HOST_REWRITE).includes("isStudioSharedAuthPath"))
check("contract) 목록이 studio-routes 에 있다", codeOf(STUDIO_ROUTES).includes("export const STUDIO_SHARED_AUTH_PATHS"))

console.log("\n[E] Studio 전용 auth 화면은 여전히 rewrite 된다")

const STUDIO_OWN_AUTH: Array<[string, string]> = [
  ["/auth/sign-in", "/studio/sign-in"],
  ["/auth/sign-up", "/studio/sign-up"],
  ["/auth/sign-out", "/studio/sign-out"]
]
for (const [external, internal] of STUDIO_OWN_AUTH) {
  equals(`E) ${STUDIO_HOST}${external} → ${internal}`, resolveStudioRewritePathname(STUDIO_HOST, external), internal)
}
/* 나머지 Studio 화면도 그대로 옮겨진다. */
equals("E) /classes 는 여전히 Studio 로 간다", resolveStudioRewritePathname(STUDIO_HOST, "/classes"), "/studio/classes")
equals("E) /applications 도 그대로다", resolveStudioRewritePathname(STUDIO_HOST, "/applications"), "/studio/applications")

console.log("\n[F] Parent host 는 영향을 받지 않는다")

for (const [pathname] of RECOVERY_ROUTES) {
  equals(`F) ${PARENT_HOST}${pathname} → rewrite 없음`, resolveStudioRewritePathname(PARENT_HOST, pathname), null)
  equals(`F) ${PARENT_HOST}${pathname} → redirect 없음`, resolveStudioCanonicalRedirectUrl(PARENT_HOST, pathname), null)
}
/* localhost 에서도 그대로 열린다. */
for (const host of ["localhost", "localhost:3000", "studio.localhost"]) {
  for (const [pathname] of RECOVERY_ROUTES) {
    equals(`F) ${JSON.stringify(host)}${pathname} → rewrite 없음`, resolveStudioRewritePathname(host, pathname), null)
  }
}
/* Parent matcher 는 /auth 를 타지 않는다. Parent 동작이 달라질 자리가 없다. */
const matcherBlock = middleware.slice(middleware.indexOf("matcher: ["))
check("F) Parent matcher 에 /auth 가 없다", !matcherBlock.includes('"/auth'))
check("F) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  matcherBlock.split("\n").some((row) => row.trim() === `"${source}",`)
))

console.log("\n[G] ?type=academy 구조가 보존된다")

check("G) Studio sign-in form 이 type=academy 로 보낸다", (() => {
  const form = codeOf("src/features/studio/ui/studio-sign-in-form.tsx")
  return form.includes("/auth/find-email?type=academy") && form.includes("/auth/reset-password?type=academy")
})())
check("G) reset 이 type 을 recovery 로 넘긴다", codeOf(RESET_CLIENT).includes("/auth/recovery?type=${userType}"))
check("G) recovery 가 type 을 update-password 로 넘긴다", codeOf(RECOVERY_CLIENT).includes('"/auth/update-password?type=academy"'))
check("G) update-password 가 type 을 읽는다", codeOf(UPDATE_PASSWORD).includes('searchParams.get("type") === "academy"'))
check("G) find-email 이 type 토글을 유지한다", codeOf(FIND_EMAIL_CLIENT).includes('userType === "academy"'))
/* rewrite 를 하지 않으므로 query 가 손상될 자리가 없다. */
check("G) 공용 auth 는 rewrite 자체를 하지 않는다", RECOVERY_ROUTES.every(([pathname]) => resolveStudioRewritePathname(STUDIO_HOST, pathname) === null))

console.log("\n[복귀 링크] host 에 맞는 로그인으로 돌아간다")

const authLayout = codeOf(AUTH_LAYOUT)
check("복귀) app/auth/layout.tsx 가 있다", exists(AUTH_LAYOUT))
check("복귀) layout 은 server component 다", !read(AUTH_LAYOUT).split("\n").slice(0, 3).some((line) => line.includes('"use client"')))
check("복귀) layout 이 hostname 을 한 번만 읽는다", (authLayout.match(/getRequestHostname\(\)/g) ?? []).length === 1)
check("복귀) layout 이 provider 로 내려준다", authLayout.includes("<StudioNavigationProvider hostname={await getRequestHostname()}>"))
check("복귀) layout 은 권한을 판단하지 않는다", ["requireTeacherStudioAccess", "role", "profiles", "supabase"].every((term) => !authLayout.includes(term)))

const RECOVERY_CLIENTS = [FIND_EMAIL_CLIENT, RESET_CLIENT, RECOVERY_CLIENT, UPDATE_PASSWORD]
for (const file of RECOVERY_CLIENTS) {
  const code = codeOf(file)
  check(`복귀) ${file} 이 학원 로그인을 host 에 맞춘다`, code.includes('useStudioNavigationPath("/studio/sign-in")'))
  /* Studio host 에서 relative /auth/sign-in 은 Studio 로그인으로 rewrite 된다. */
  check(`복귀) ${file} 이 학부모 로그인은 Parent origin 으로 보낸다`, code.includes('useParentCrossProductHref("/auth/sign-in")'))
  check(`복귀) ${file} 에 하드코딩된 /studio/sign-in 이 없다`, !code.includes('"/studio/sign-in"') || code.includes('useStudioNavigationPath("/studio/sign-in")'))
  check(`복귀) ${file} 이 render 중에 host 를 읽지 않는다`, !/window\.location\.(hostname|host)\b/.test(code))
}
check("복귀) cross-product 훅이 S3E helper 를 재사용한다", codeOf(PROVIDER).includes("getParentCrossProductHref"))

console.log("\n[H] reset redirectTo 는 현재 origin 기반 그대로다")

const resetClient = codeOf(RESET_CLIENT)
check("H) window.location.origin 기반이다", resetClient.includes("const redirectTo = `${window.location.origin}/auth/recovery?type=${userType}`"))
check("H) resetPasswordForEmail 에 그대로 넘긴다", resetClient.includes("resetPasswordForEmail(trimmedEmail, { redirectTo })"))
/* 절대 주소를 박으면 Studio host 에서 Parent 로 메일이 간다. */
check("H) 절대 origin 을 하드코딩하지 않았다", !resetClient.includes("firstsuup.com") && !resetClient.includes("STUDIO_ORIGIN") && !resetClient.includes("PARENT_ORIGIN"))
check("H) recovery 경로도 공용 목록 안이다", isStudioSharedAuthPath("/auth/recovery"))

console.log("\n[I] OAuth callback 무변경")

const callback = codeOf(OAUTH_CALLBACK)
const kakao = codeOf(KAKAO_BUTTON)
check("I) callback 이 code 를 세션으로 교환한다", callback.includes("supabase.auth.exchangeCodeForSession(code)"))
check("I) callback 이 요청 origin 안에서만 돈다", (() => {
  const redirects = Array.from(callback.matchAll(/NextResponse\.redirect\(\s*new URL\(([\s\S]*?)\)\s*\)/g))
  return redirects.length > 0 && redirects.every((match) => match[1].includes("requestUrl.origin"))
})())
check("I) callback 이 routing helper 를 쓰지 않는다", !callback.includes("studio-routes") && !callback.includes("studio-host-rewrite") && !callback.includes("studio-navigation"))
check("I) KakaoAuthButton 계약이 그대로다", kakao.includes('provider: "kakao"') && kakao.includes("const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(resolveSafeNext(next))}`"))
check("I) KakaoAuthButton 이 routing helper 를 쓰지 않는다", !kakao.includes("studio-navigation") && !kakao.includes("cross-product-navigation"))
/* /auth/callback 은 공용 목록에 넣지 않았다 — OAuth 는 이번 범위 밖이다. */
check("I) /auth/callback 을 공용 목록에 넣지 않았다", !isStudioSharedAuthPath("/auth/callback"))

console.log("\n[J] cookie · auth · RLS 무변경")

check("J) middleware response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("J) cookie 전파 계약 그대로", middleware.includes("takePendingCookies()") && middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))
check("J) canonical redirect 계약 그대로", middleware.includes("resolveStudioCanonicalRedirectUrl"))
for (const [label, code] of [
  [MIDDLEWARE, middleware],
  [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)],
  [SUPABASE_SERVER, codeOf(SUPABASE_SERVER)]
] as const) {
  check(`J) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
  check(`J) ${label} 이 sameSite 를 지정하지 않는다`, !/\bsameSite\s*:/.test(code))
}
check("J) server client 는 여전히 cache() 다", codeOf(SUPABASE_SERVER).includes("export const getSupabaseServerClient = cache(async ()"))
check("J) middleware client 는 여전히 cookie 를 모으기만 한다", (() => {
  const client = codeOf(SUPABASE_MIDDLEWARE)
  return client.includes("pendingCookies.push(cookie)") && !client.includes("NextResponse.")
})())

const AUTH_CONTRACT_FILES = [
  "src/features/auth/lib/profile-sync.ts",
  "src/features/auth/lib/session.ts",
  "src/features/auth/lib/redirect.ts",
  "src/features/auth/lib/current-auth.ts",
  "src/features/studio/lib/require-teacher-studio-access.ts",
  "src/features/my/lib/require-parent-access.ts"
]
for (const file of AUTH_CONTRACT_FILES) {
  check(`J) ${file} 가 그대로 있다`, exists(file))
  check(`J) ${file} 가 host 로 권한을 판단하지 않는다`, !read(file).includes("isStudioHost") && !read(file).includes("isParentHost"))
}
check("J) studio guard 는 여전히 DB role 로 판단한다", (() => {
  const guard = read("src/features/studio/lib/require-teacher-studio-access.ts")
  return guard.includes("normalizeProfileRole") && guard.includes('normalized.dbRole === "parent"')
})())
check("J) DB 마이그레이션을 건드리지 않았다", walk("supabase/migrations").filter((file) => file.endsWith(".sql")).every((file) => !read(file).includes("shared_auth")))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
