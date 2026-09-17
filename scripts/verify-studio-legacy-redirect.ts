// 옛 /studio URL 의 canonical redirect 계약 검증 (STUDIO SUBDOMAIN S3C).
//
//   npx tsx scripts/verify-studio-legacy-redirect.ts
//
// 여기서 고정하는 것.
//   A. /studio              → STUDIO_ORIGIN + "/"
//   B. /studio/applications → STUDIO_ORIGIN + "/applications"
//   C. /studio/sign-in      → STUDIO_ORIGIN + "/auth/sign-in"
//   D. query 를 보존한다.
//   E. Parent /classes 는 redirect 하지 않는다.
//   F. Studio 의 clean /classes 는 redirect 없이 internal rewrite 로 간다.
//   G. Studio /studio/classes 도 clean URL 로 돌려보낸다.
//   H. revalidatePath("/studio/...") 는 그대로다.
//   I. Toss callback 은 그대로다.
//   J. cookie refresh response 계약(S3B)이 유지된다.
//   K. redirect 판단에 auth/role 이 끼어들지 않는다.
//
// redirect 는 routing canonicalization 이다. 권한 판단이 아니다.
// 판단은 순수 함수를 실제로 불러서 본다. 나머지는 소스를 읽는다.
// DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { PARENT_ORIGIN, STUDIO_ORIGIN } from "@/shared/config/site-origins"
import {
  resolveStudioCanonicalRedirectUrl,
  resolveStudioRewritePathname
} from "@/shared/config/studio-host-rewrite"

const MIDDLEWARE = "middleware.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const HOST_REWRITE = "src/shared/config/studio-host-rewrite.ts"
const TOSS_CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"

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
const PARENT_HOST = new URL(PARENT_ORIGIN).hostname
const WWW_HOST = `www.${PARENT_HOST}`

console.log("[A-C] 옛 /studio URL → canonical Studio URL")

/* S3A contract 가 아는 화면 전부. 특수 매핑(auth)도 같은 규칙으로 따라온다. */
const LEGACY_REDIRECTS: Array<[string, string]> = [
  ["/studio", "/"],
  ["/studio/applications", "/applications"],
  ["/studio/applications/abc", "/applications/abc"],
  ["/studio/classes", "/classes"],
  ["/studio/classes/new", "/classes/new"],
  ["/studio/classes/abc/edit", "/classes/abc/edit"],
  ["/studio/teachers", "/teachers"],
  ["/studio/schedule", "/schedule"],
  ["/studio/cases", "/cases"],
  ["/studio/cases/import", "/cases/import"],
  ["/studio/billing", "/billing"],
  ["/studio/billing/callback", "/billing/callback"],
  ["/studio/mypage", "/mypage"],
  ["/studio/mypage/profile", "/mypage/profile"],
  ["/studio/settings", "/settings"],
  ["/studio/unregistered", "/unregistered"],
  ["/studio/access", "/access"],
  ["/studio/pending", "/pending"],
  ["/studio/sign-in", "/auth/sign-in"],
  ["/studio/sign-up", "/auth/sign-up"],
  ["/studio/sign-out", "/auth/sign-out"]
]

/* Parent host 와 Studio host 모두 같은 canonical 주소로 간다. */
for (const host of [PARENT_HOST, WWW_HOST, STUDIO_HOST]) {
  for (const [legacy, external] of LEGACY_REDIRECTS) {
    equals(
      `A-C) ${host}${legacy} → ${STUDIO_ORIGIN}${external}`,
      resolveStudioCanonicalRedirectUrl(host, legacy),
      `${STUDIO_ORIGIN}${external}`
    )
  }
}
/* 모든 결과가 Studio origin 의 절대 주소다. */
const allRedirects = LEGACY_REDIRECTS.map(([legacy]) => resolveStudioCanonicalRedirectUrl(PARENT_HOST, legacy))
check("A-C) 전부 STUDIO_ORIGIN 절대 주소다", allRedirects.every((url) => url?.startsWith(`${STUDIO_ORIGIN}/`)))
check("A-C) 어디에도 /studio prefix 가 남지 않는다", allRedirects.every((url) => !url?.includes("/studio/studio") && !new URL(url!).pathname.startsWith("/studio")))
check("A-C) 중복 slash 가 없다", allRedirects.every((url) => !new URL(url!).pathname.includes("//")))

console.log("\n[D] query 보존")

equals(
  "D) /studio/access?reason=missing_org",
  resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio/access", "?reason=missing_org"),
  `${STUDIO_ORIGIN}/access?reason=missing_org`
)
equals(
  "D) /studio/sign-in?returnTo=%2Fapplications",
  resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio/sign-in", "?returnTo=%2Fapplications"),
  `${STUDIO_ORIGIN}/auth/sign-in?returnTo=%2Fapplications`
)
equals(
  "D) 여러 개의 query 를 그대로 옮긴다",
  resolveStudioCanonicalRedirectUrl(STUDIO_HOST, "/studio/cases", "?status=new&page=2"),
  `${STUDIO_ORIGIN}/cases?status=new&page=2`
)
equals("D) query 가 없으면 ? 를 붙이지 않는다", resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio"), `${STUDIO_ORIGIN}/`)
/* query 를 문자열로 이어 붙이면 인코딩이 깨진다. URL 로 만든다. */
check("D) URL 로 만들어 query 를 붙인다", hostRewrite.includes("url.search = search"))
check("D) middleware 가 search 를 넘긴다", middleware.includes("resolveStudioCanonicalRedirectUrl(hostname, pathname, search)"))

console.log("\n[E] Parent public route 는 건드리지 않는다")

const PARENT_PUBLIC = [
  "/",
  "/classes",
  "/classes/abc",
  "/classes/abc/apply",
  "/academies",
  "/academy/some-handle",
  "/auth/sign-in",
  "/auth/sign-in/email",
  "/auth/callback",
  "/auth/find-email",
  "/favorites",
  "/my",
  "/my/applications",
  "/terms",
  "/privacy",
  "/partner"
]
for (const host of [PARENT_HOST, WWW_HOST]) {
  for (const pathname of PARENT_PUBLIC) {
    equals(`E) ${host}${pathname} → redirect 없음`, resolveStudioCanonicalRedirectUrl(host, pathname), null)
    equals(`E) ${host}${pathname} → rewrite 없음`, resolveStudioRewritePathname(host, pathname), null)
  }
}
/* /studiolike 는 Studio 경로가 아니다. Parent 에서 건드리지 않는다. */
equals("E) Parent /studiolike → redirect 없음", resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studiolike"), null)

console.log("\n[F] Studio 의 clean URL 은 redirect 없이 internal rewrite 로 간다")

const CLEAN_REWRITES: Array<[string, string]> = [
  ["/", "/studio"],
  ["/classes", "/studio/classes"],
  ["/applications", "/studio/applications"],
  ["/auth/sign-in", "/studio/sign-in"],
  ["/billing/callback", "/studio/billing/callback"]
]
for (const [clean, internal] of CLEAN_REWRITES) {
  equals(`F) ${STUDIO_HOST}${clean} → redirect 없음`, resolveStudioCanonicalRedirectUrl(STUDIO_HOST, clean), null)
  equals(`F) ${STUDIO_HOST}${clean} → rewrite ${internal}`, resolveStudioRewritePathname(STUDIO_HOST, clean), internal)
}

console.log("\n[G] Studio 의 /studio prefix 도 clean URL 로 돌려보낸다")

for (const [legacy, external] of LEGACY_REDIRECTS) {
  equals(`G) ${STUDIO_HOST}${legacy} → ${STUDIO_ORIGIN}${external}`, resolveStudioCanonicalRedirectUrl(STUDIO_HOST, legacy), `${STUDIO_ORIGIN}${external}`)
  /* redirect 가 이긴다 — 같은 요청을 rewrite 로도 처리하면 안 된다. */
  equals(`G) ${STUDIO_HOST}${legacy} 는 rewrite 대상이 아니다`, resolveStudioRewritePathname(STUDIO_HOST, legacy), null)
}
check("G) middleware 는 redirect 를 먼저 본다", middleware.indexOf("resolveStudioCanonicalRedirectUrl") < middleware.indexOf("resolveStudioRewritePathname("))
check(
  "G) redirect 가 있으면 rewrite 를 하지 않는다",
  middleware.includes("const studioRewritePathname = studioCanonicalRedirectUrl\n    ? null\n    : resolveStudioRewritePathname(hostname, pathname)")
)

console.log("\n[status] 아직 영구 이전이 아니다")

check("status) 307 temporary 를 쓴다", middleware.includes("const LEGACY_REDIRECT_STATUS = 307"))
for (const permanent of ["308", "301", "permanent"]) {
  check(`status) ${permanent} 를 쓰지 않는다`, !middleware.includes(permanent))
}

console.log("\n[static/API] 제외")

const PASS_THROUGH = [
  "/_next/static/chunks/main.js",
  "/api/health/supabase",
  "/api/webhooks/toss",
  "/favicon.ico",
  "/images/first-class-logo.png",
  "/robots.txt",
  "/sitemap.xml"
]
for (const host of [PARENT_HOST, STUDIO_HOST]) {
  for (const pathname of PASS_THROUGH) {
    equals(`static) ${host}${pathname} → redirect 없음`, resolveStudioCanonicalRedirectUrl(host, pathname), null)
  }
}
check("static) matcher 가 _next · api · 정적 파일을 제외한다", middleware.includes("(?!_next/|api/"))

console.log("\n[dev host] 아직 계약이 아닌 host 는 그대로 둔다")

/* 로컬에서 /studio/... 가 production 으로 튀면 개발이 막힌다. */
for (const host of ["localhost", "localhost:3000", "studio.localhost", "127.0.0.1:3000", "", "evil.com", "studio.firstsuup.com.evil.com"]) {
  equals(`dev) ${JSON.stringify(host)}/studio/classes → redirect 없음`, resolveStudioCanonicalRedirectUrl(host, "/studio/classes"), null)
}

console.log("\n[H] revalidatePath(\"/studio/...\") 무변경")

const walk = (path: string): string[] => {
  const full = resolve(process.cwd(), path)
  if (!existsSync(full)) return []
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  )
}
const revalidateTargets = Array.from(
  new Set(
    walk("src/features")
      .filter((file) => /\.ts$/.test(file))
      .flatMap((file) => Array.from(read(file).matchAll(/revalidatePath\("([^"]*)"\)/g)).map((match) => match[1]))
      .filter((target) => target.startsWith("/studio"))
  )
).sort()

check("H) Studio revalidatePath 대상이 남아 있다", revalidateTargets.length > 0, `${revalidateTargets.length}개`)
for (const target of ["/studio", "/studio/schedule", "/studio/classes", "/studio/teachers"]) {
  check(`H) ${target} 가 그대로다`, revalidateTargets.includes(target))
}
/* 내부 서버 계약이다. external path 로 바꾸면 캐시가 엉뚱한 자리를 턴다. */
check("H) revalidatePath 를 external path 로 바꾸지 않았다", revalidateTargets.every((target) => target.startsWith("/studio")))
check("H) revalidatePath 가 canonical helper 를 쓰지 않는다", !walk("src/features").some((file) => /\.ts$/.test(file) && read(file).includes("resolveStudioCanonicalRedirectUrl")))

console.log("\n[I] Toss callback 무변경")

const tossCheckout = codeOf(TOSS_CHECKOUT)
check('I) CALLBACK_PATH 가 "/studio/billing/callback" 이다', tossCheckout.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
/* S4C: 결제 복귀 주소는 이제 host 에 맞춰 만들어진다. 내부 경로 상수와
   실패 query 는 그대로다. 자세한 계약은 verify-studio-billing-callback-routing. */
check("I) successUrl 은 요청 origin 과 callback 경로로 만들어진다", tossCheckout.includes("successUrl: toCallbackUrl(CALLBACK_PATH)"))
check("I) 실패 query 가 그대로다", tossCheckout.includes("?billing=failed"))
check("I) Toss checkout 이 studio routing helper 를 쓰지 않는다", !tossCheckout.includes("studio-host-rewrite") && !tossCheckout.includes("studio-routes"))
check("I) callback route 가 그대로 있다", exists("app/studio/(dashboard)/billing/callback/page.tsx"))

console.log("\n[J] cookie refresh response 계약(S3B) 유지")

check("J) response 는 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("J) response 는 const 다", middleware.includes("const response = studioCanonicalRedirectUrl"))
check("J) response 를 재할당하지 않는다", !/\bresponse\s*=\s*NextResponse/.test(middleware.replace("const response = studioCanonicalRedirectUrl", "")))
check(
  "J) response 는 getClaims() 뒤에 만들어진다",
  middleware.indexOf("await supabase.auth.getClaims()") < middleware.indexOf("const response = studioCanonicalRedirectUrl")
)
check(
  "J) redirect response 에도 모아 둔 cookie 를 적는다",
  middleware.indexOf("const response = studioCanonicalRedirectUrl") < middleware.indexOf("takePendingCookies()") &&
    middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)")
)
check("J) supabase helper 는 여전히 NextResponse 를 만들지 않는다", !supabaseMiddleware.includes("NextResponse."))
check("J) setAll 은 cookie 를 모으기만 한다", supabaseMiddleware.includes("pendingCookies.push(cookie)"))
for (const [label, code] of [
  [MIDDLEWARE, middleware],
  [SUPABASE_MIDDLEWARE, supabaseMiddleware],
  [HOST_REWRITE, hostRewrite]
] as const) {
  check(`J) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
  check(`J) ${label} 에 .firstsuup.com cookie domain 이 없다`, !code.includes('".firstsuup.com"'))
}

console.log("\n[K] redirect 판단에 auth/role 이 끼어들지 않는다")

const AUTHZ_TERMS = [
  "requireTeacherStudioAccess",
  "requireParentAccess",
  "resolveCurrentAuth",
  "normalizeProfileRole",
  "profiles",
  "role",
  "organization_id",
  "teachers",
  "getUser("
]
for (const term of AUTHZ_TERMS) {
  check(`K) middleware 에 ${term} 가 없다`, !middleware.includes(term))
  check(`K) studio-host-rewrite 에 ${term} 가 없다`, !hostRewrite.includes(term))
}
check("K) middleware 는 여전히 getClaims 만 부른다", middleware.includes("await supabase.auth.getClaims()"))
check("K) redirect 주소가 세션과 무관하다", (() => {
  /* 같은 입력이면 언제나 같은 결과다. 세션을 읽을 자리가 없다. */
  const first = resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio/applications", "?a=1")
  const second = resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio/applications", "?a=1")
  return first === second && first === `${STUDIO_ORIGIN}/applications?a=1`
})())
check("K) studio-host-rewrite 는 next 를 import 하지 않는다", !/from "next/.test(hostRewrite))
check("K) auth 가드 파일이 그대로 있다", ["src/features/studio/lib/require-teacher-studio-access.ts", "src/features/my/lib/require-parent-access.ts", "src/features/auth/lib/profile-sync.ts"].every(exists))
check(
  "K) auth 가드가 routing helper 를 쓰지 않는다",
  ["src/features/studio/lib/require-teacher-studio-access.ts", "src/features/my/lib/require-parent-access.ts", "src/features/auth/lib/profile-sync.ts"].every(
    (file) => !read(file).includes("studio-host-rewrite") && !read(file).includes("studio-routes")
  )
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
