// Studio host inbound rewrite + Supabase cookie 전파 계약 검증 (STUDIO SUBDOMAIN S3B).
//
//   npx tsx scripts/verify-studio-host-rewrite.ts
//
// [routing] 여기서 고정하는 것.
//   A. Studio host "/"            → /studio
//   B. Studio host "/classes"     → /studio/classes
//   C. Studio host "/auth/sign-in" → /studio/sign-in
//   D. query 를 잃지 않는 clone 방식을 쓴다.
//   E. Parent host "/classes"     → rewrite 없음
//   F. Parent host "/auth/sign-in" → rewrite 없음
//   G. 이미 internal 인 /studio/classes → double prefix 없음
//   H. static · API 는 rewrite 하지 않는다.
//   I. host 를 auth/role 판정에 쓰지 않는다.
//
// [cookie] 이번 단계의 P0.
//   A. 최종 response 는 middleware 가 한 번 만들고, Supabase cookie 가 거기 적힌다.
//   B. setAll 은 request cookie 갱신 + 쓸 cookie 수집만 한다.
//   C. setAll 안에서 NextResponse 를 다시 만들지 않는다.
//   D. rewrite 이후 response 를 교체하지 않는다.
//   E. cookie domain 을 설정하지 않는다.
//
// routing 판단은 순수 함수를 실제로 불러서 본다. response/cookie 구조는
// 소스를 읽어서 본다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { STUDIO_ORIGIN, isParentHost, isStudioHost } from "@/shared/config/site-origins"
import { resolveStudioRewritePathname } from "@/shared/config/studio-host-rewrite"

const MIDDLEWARE = "middleware.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const SUPABASE_SERVER = "src/integrations/supabase/server.ts"
const HOST_REWRITE = "src/shared/config/studio-host-rewrite.ts"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const codeOf = (path: string) => stripComments(read(path))

const middleware = codeOf(MIDDLEWARE)
const supabaseMiddleware = codeOf(SUPABASE_MIDDLEWARE)
const hostRewrite = codeOf(HOST_REWRITE)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}
const equals = (label: string, actual: unknown, expected: unknown) =>
  check(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

const STUDIO_HOST = new URL(STUDIO_ORIGIN).hostname
const PARENT_HOSTS = ["firstsuup.com", "www.firstsuup.com"]

console.log("[routing A-C] Studio host external → internal")

const STUDIO_REWRITES: Array<[string, string]> = [
  ["/", "/studio"],
  ["/classes", "/studio/classes"],
  ["/classes/new", "/studio/classes/new"],
  ["/classes/abc/edit", "/studio/classes/abc/edit"],
  ["/applications", "/studio/applications"],
  ["/applications/abc", "/studio/applications/abc"],
  ["/auth/sign-in", "/studio/sign-in"],
  ["/auth/sign-up", "/studio/sign-up"],
  ["/auth/sign-out", "/studio/sign-out"],
  ["/billing", "/studio/billing"],
  ["/billing/callback", "/studio/billing/callback"],
  ["/teachers", "/studio/teachers"],
  ["/schedule", "/studio/schedule"],
  ["/cases", "/studio/cases"],
  ["/cases/import", "/studio/cases/import"],
  ["/mypage", "/studio/mypage"],
  ["/mypage/profile", "/studio/mypage/profile"],
  ["/settings", "/studio/settings"],
  ["/unregistered", "/studio/unregistered"],
  ["/access", "/studio/access"],
  ["/pending", "/studio/pending"]
]

for (const [external, internal] of STUDIO_REWRITES) {
  equals(`routing) ${STUDIO_HOST}${external} → ${internal}`, resolveStudioRewritePathname(STUDIO_HOST, external), internal)
}
/* host 표기가 흔들려도 같은 판단이어야 한다. */
for (const host of [STUDIO_HOST.toUpperCase(), `${STUDIO_HOST}:443`, `${STUDIO_HOST}.`]) {
  equals(`routing) ${host}/classes → /studio/classes`, resolveStudioRewritePathname(host, "/classes"), "/studio/classes")
}

console.log("\n[routing D] query 를 잃지 않는 clone 방식")

check("routing D) request.nextUrl.clone() 을 쓴다", middleware.includes("request.nextUrl.clone()"))
check("routing D) pathname 만 바꾼다", /url\.pathname = pathname/.test(middleware))
/* URL 을 새로 만들면 query 가 사라진다. */
check("routing D) new URL(...) 로 rewrite 주소를 만들지 않는다", !middleware.includes("new URL("))
check("routing D) search/hash 를 건드리지 않는다", !middleware.includes(".search =") && !middleware.includes(".hash ="))
check("routing D) rewrite 는 clone 한 URL 로 부른다", middleware.includes("NextResponse.rewrite(withPathname(request, studioRewritePathname)"))

console.log("\n[routing E-F] Parent host 는 영향을 받지 않는다")

for (const host of PARENT_HOSTS) {
  for (const [external] of STUDIO_REWRITES) {
    equals(`routing) ${host}${external} → rewrite 없음`, resolveStudioRewritePathname(host, external), null)
  }
}
/* 개발 host 도 아직 Studio 가 아니다. */
for (const host of ["localhost", "localhost:3000", "studio.localhost", "", "evil.com", "studio.firstsuup.com.evil.com"]) {
  equals(`routing) ${JSON.stringify(host)}/classes → rewrite 없음`, resolveStudioRewritePathname(host, "/classes"), null)
}

console.log("\n[routing G] 이미 internal 이면 prefix 를 또 붙이지 않는다")

for (const internal of ["/studio", "/studio/classes", "/studio/applications/abc", "/studio/sign-in", "/studio/billing/callback"]) {
  equals(`routing G) ${internal} → rewrite 없음`, resolveStudioRewritePathname(STUDIO_HOST, internal), null)
}
/* 어떤 입력으로도 /studio/studio 가 나오지 않는다. */
const allRewrites = [
  ...STUDIO_REWRITES.map(([external]) => resolveStudioRewritePathname(STUDIO_HOST, external)),
  ...["/studio", "/studio/classes"].map((path) => resolveStudioRewritePathname(STUDIO_HOST, path))
]
check("routing G) double prefix 가 없다", allRewrites.every((path) => !path?.includes("/studio/studio")))
check("routing G) 중복 slash 가 없다", allRewrites.every((path) => !path?.includes("//")))
/* /studiolike 는 Studio 내부 경로가 아니다. 평범하게 rewrite 된다. */
equals("routing G) /studiolike 는 내부 경로가 아니다", resolveStudioRewritePathname(STUDIO_HOST, "/studiolike"), "/studio/studiolike")

console.log("\n[routing H] static · API 는 rewrite 하지 않는다")

const PASS_THROUGH = [
  "/_next/static/chunks/main.js",
  "/_next/image",
  "/api/health/supabase",
  "/api/webhooks/toss",
  "/favicon.ico",
  "/images/first-class-logo.png",
  "/fonts/pretendard.woff2",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image.png"
]
for (const path of PASS_THROUGH) {
  equals(`routing H) ${path} → rewrite 없음`, resolveStudioRewritePathname(STUDIO_HOST, path), null)
}
/* matcher 에서도 빠져 있어야 middleware 가 아예 돌지 않는다. */
check("routing H) matcher source 가 _next · api · 정적 파일을 제외한다", middleware.includes("(?!_next/|api/"))

console.log("\n[routing I] host 를 auth/role 판정에 쓰지 않는다")

const AUTHZ_TERMS = [
  "requireTeacherStudioAccess",
  "requireParentAccess",
  "resolveCurrentAuth",
  "normalizeProfileRole",
  "profiles",
  "role",
  "organization_id",
  "teachers"
]
for (const term of AUTHZ_TERMS) {
  check(`routing I) middleware 에 ${term} 가 없다`, !middleware.includes(term))
  check(`routing I) studio-host-rewrite 에 ${term} 가 없다`, !hostRewrite.includes(term))
}
check("routing I) middleware 는 redirect 하지 않는다", !middleware.includes("NextResponse.redirect"))
check("routing I) middleware 는 여전히 getClaims 만 부른다", middleware.includes("await supabase.auth.getClaims()"))
check("routing I) middleware 는 DB 를 조회하지 않는다", !middleware.includes(".from(") && !middleware.includes("service-role"))
check("routing I) studio-host-rewrite 는 next 를 import 하지 않는다", !/from "next/.test(hostRewrite))
/* 경로 규칙은 S3A contract 하나만 쓴다. middleware 에 다시 적지 않는다. */
check("routing I) 경로를 middleware 본문에 다시 하드코딩하지 않았다", !/"\/studio\//.test(middleware.slice(0, middleware.indexOf("matcher: ["))))
check("routing I) mapping 은 S3A contract 를 쓴다", hostRewrite.includes("toStudioInternalPath") && hostRewrite.includes("isStudioInternalPath"))
check("routing I) host 판별은 S1 helper 를 쓴다", hostRewrite.includes("isStudioHost"))

console.log("\n[matcher] Parent 범위를 넓히지 않는다")

check("matcher) Parent 항목이 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) => middleware.includes(`"${source}"`)))
/* Parent 항목에 host 조건이 붙으면 기존 Parent 동작이 바뀐다. */
const matcherBlock = middleware.slice(middleware.indexOf("matcher: ["))
for (const source of ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"]) {
  const line = matcherBlock.split("\n").find((row) => row.includes(`"${source}"`)) ?? ""
  check(`matcher) ${source} 는 조건 없는 문자열 항목이다`, line.trim() === `"${source}",`, line.trim())
}
check("matcher) Studio 항목은 host 조건부다", (matcherBlock.match(/has: \[\{ type: "host"/g) ?? []).length === 2)
check(
  "matcher) Studio host literal 이 STUDIO_ORIGIN 과 일치한다",
  (matcherBlock.match(/value: "([^"]+)"/g) ?? []).every((entry) => entry === `value: "${STUDIO_HOST}"`),
  STUDIO_HOST
)
/* Parent 공개 화면이 통째로 middleware 를 타게 만들지 않는다. */
check("matcher) 조건 없는 광역 matcher 가 없다", !matcherBlock.includes('"/:path*"') && !matcherBlock.includes('"/(.*)"'))
check("matcher) config 는 literal 로만 적혀 있다", !/source: [A-Z_]/.test(matcherBlock) && !/has: [A-Z_]/.test(matcherBlock))

console.log("\n[cookie A-B] 최종 response 하나에 Supabase cookie 를 적는다")

check("cookie A) middleware 가 rewrite response 를 만든다", middleware.includes("NextResponse.rewrite("))
check("cookie A) middleware 가 next response 를 만든다", middleware.includes("NextResponse.next({ request })"))
check("cookie A) Supabase cookie 를 그 response 에 적는다", middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))
check("cookie A) 모아 둔 cookie 를 비우며 가져간다", middleware.includes("takePendingCookies()"))
check("cookie B) setAll 이 request cookie 를 갱신한다", supabaseMiddleware.includes("request.cookies.set(cookie.name, cookie.value)"))
check("cookie B) setAll 이 쓸 cookie 를 모아 둔다", supabaseMiddleware.includes("pendingCookies.push(cookie)"))
check("cookie B) 모은 cookie 는 한 번만 나간다", supabaseMiddleware.includes("pendingCookies.splice(0, pendingCookies.length)"))
check("cookie B) getAll 은 request cookie 를 읽는다", supabaseMiddleware.includes("request.cookies.getAll()"))

console.log("\n[cookie C-D] response 를 다시 만들거나 교체하지 않는다")

/* helper 가 response 를 만들면 rewrite 가 유실된다. 아예 만들지 못하게 한다. */
check("cookie C) supabase helper 가 NextResponse 를 만들지 않는다", !supabaseMiddleware.includes("NextResponse."))
check("cookie C) supabase helper 는 NextResponse 를 값으로 import 하지 않는다", supabaseMiddleware.includes('import type { NextRequest, NextResponse } from "next/server"'))
check("cookie C) supabase helper 가 response 를 돌려주지 않는다", !/response\s*:/.test(supabaseMiddleware.replace(/MiddlewareSupabaseResult[\s\S]*?\}/, "")))
check("cookie D) response 는 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite)\(/g) ?? []).length === 2)
check("cookie D) response 는 const 다", middleware.includes("const response = studioRewritePathname"))
check("cookie D) response 를 재할당하지 않는다", !/\bresponse\s*=\s*NextResponse/.test(middleware.replace("const response = studioRewritePathname", "")))
/* refresh 가 끝난 뒤에 만들어야 갱신된 request cookie 가 downstream 으로 간다. */
check(
  "cookie D) response 는 getClaims() 뒤에 만들어진다",
  middleware.indexOf("await supabase.auth.getClaims()") < middleware.indexOf("const response = studioRewritePathname")
)
check(
  "cookie D) cookie 적용은 response 생성 뒤다",
  middleware.indexOf("const response = studioRewritePathname") < middleware.indexOf("takePendingCookies()")
)

console.log("\n[cookie E] cookie 계약 무변경")

for (const [label, code] of [
  [SUPABASE_MIDDLEWARE, supabaseMiddleware],
  [MIDDLEWARE, middleware],
  [SUPABASE_SERVER, codeOf(SUPABASE_SERVER)]
] as const) {
  check(`cookie E) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
  check(`cookie E) ${label} 이 sameSite 를 지정하지 않는다`, !/\bsameSite\s*:/.test(code))
  check(`cookie E) ${label} 이 secure 를 지정하지 않는다`, !/\bsecure\s*:/.test(code))
  check(`cookie E) ${label} 에 .firstsuup.com cookie domain 이 없다`, !code.includes('".firstsuup.com"'))
}
check("cookie E) Supabase 가 준 options 를 그대로 넘긴다", middleware.includes("cookie.options"))
check("cookie E) cookie 이름을 만지지 않는다", !supabaseMiddleware.includes('"sb-') && !middleware.includes('"sb-'))

console.log("\n[범위] S3B 에서 건드리지 않기로 한 것")

/* getSupabaseServerClient 는 C12 결과물이다. 그대로 둔다. */
const supabaseServer = codeOf(SUPABASE_SERVER)
check("범위) getSupabaseServerClient 는 여전히 cache() 다", supabaseServer.includes("export const getSupabaseServerClient = cache(async ()"))
check("범위) server client 는 cookieStore 로 읽고 쓴다", supabaseServer.includes("cookieStore.set(cookie.name, cookie.value, cookie.options)"))
check("범위) server client 가 host 를 보지 않는다", !supabaseServer.includes("isStudioHost") && !supabaseServer.includes("studio-host-rewrite"))

/* auth / role 계약 파일은 이번 단계에서 손대지 않는다. */
const AUTH_FILES = [
  "src/features/studio/lib/require-teacher-studio-access.ts",
  "src/features/my/lib/require-parent-access.ts",
  "src/features/auth/lib/profile-sync.ts",
  "src/features/auth/lib/session.ts",
  "app/auth/callback/route.ts"
]
for (const file of AUTH_FILES) {
  check(`범위) ${file} 가 그대로 있다`, exists(file))
  check(`범위) ${file} 가 host 를 보지 않는다`, !read(file).includes("isStudioHost") && !read(file).includes("studio-host-rewrite"))
}
/* S3C 범위 — 내부 href 는 아직 그대로다. */
check("범위) Studio 내부 href 가 아직 /studio/... 다", read("src/features/studio/ui/studio-sign-in-form.tsx").includes('href="/studio/sign-up"'))
check("범위) Toss CALLBACK_PATH 가 그대로다", read("src/features/billing/actions/start-standard-checkout.ts").includes('const CALLBACK_PATH = "/studio/billing/callback"'))

console.log("\n[host helper] Studio/Parent 판별")

check("host) Studio host 를 알아본다", isStudioHost(STUDIO_HOST))
check("host) Parent host 를 Studio 로 보지 않는다", PARENT_HOSTS.every((host) => !isStudioHost(host)))
check("host) Parent host 를 알아본다", PARENT_HOSTS.every((host) => isParentHost(host)))
check("host) Studio host 를 Parent 로 보지 않는다", !isParentHost(STUDIO_HOST))
check("host) middleware 는 x-forwarded-host 를 먼저 본다", middleware.includes('request.headers.get("x-forwarded-host") ?? request.headers.get("host")'))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
