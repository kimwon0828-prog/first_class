// Parent → Studio 진입 CTA 이전 검증 (STUDIO SUBDOMAIN S4B).
//
//   npx tsx scripts/verify-parent-studio-cta-migration.ts
//
// 여기서 고정하는 것.
//   A. Parent production host 의 Studio CTA 는 studio.firstsuup.com 절대 URL
//   B. localhost 에서는 기존 /studio/... 상대 경로
//   C. Parent 로그인 화면에 Studio CTA 를 다시 만들지 않았다 (S2 계약)
//   D. account-conflict 는 Studio 로그인 절대 URL 로 간다
//   E. Partner 로그인 CTA
//   F. Partner 계정 신청 CTA
//   G. Partner 요금제(billing) CTA
//   H. S3E requireParentAccess 계약 유지
//   I. Studio→Parent 계약 유지 (S3E · S4A)
//   J. middleware 무변경
//   K. Toss 무변경
//   L. auth · RLS 무변경
//
// Parent 와 Studio 는 다른 origin 이다. 상대 경로 "/studio" 는 Parent host 에서
// canonical redirect 를 한 번 더 타야 도착한다 — 의도된 진입점은 바로 간다.
//
// 순수 함수 호출 + 소스 검사만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { PARENT_ORIGIN, STUDIO_ORIGIN } from "@/shared/config/site-origins"
import { getStudioCrossProductHref } from "@/shared/config/cross-product-navigation"

const CROSS_PRODUCT_SERVER = "src/shared/lib/cross-product-navigation-server.ts"
const CROSS_PRODUCT = "src/shared/config/cross-product-navigation.ts"
const PARENT_SIGN_IN = "app/auth/sign-in/page.tsx"
const PARENT_SIGN_IN_FORM = "src/features/auth/ui/sign-in-form.tsx"
const ACCOUNT_CONFLICT = "app/auth/account-conflict/page.tsx"
const PARTNER_LANDING = "app/partner/PartnerLanding.tsx"
const FAVORITES_PAGE = "app/favorites/page.tsx"
const FAVORITES_CLIENT = "app/favorites/favorites-client.tsx"
const PARENT_GUARD = "src/features/my/lib/require-parent-access.ts"
const STUDIO_GUARD = "src/features/studio/lib/require-teacher-studio-access.ts"
const MIDDLEWARE = "middleware.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const SUPABASE_SERVER = "src/integrations/supabase/server.ts"
const TOSS_CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"

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
const sourceFiles = ["app", "src"].flatMap(walk).filter((file) => /\.(ts|tsx)$/.test(file))
const isClientFile = (path: string) => read(path).split("\n").slice(0, 3).some((line) => line.includes('"use client"'))

const middleware = codeOf(MIDDLEWARE)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}
const equals = (label: string, actual: unknown, expected: unknown) =>
  check(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

const PARENT_HOST = new URL(PARENT_ORIGIN).hostname
const WWW_HOST = `www.${PARENT_HOST}`
const toStudio = (hostname: string, internalPath: string) => getStudioCrossProductHref({ internalPath, hostname })

console.log("[A] Parent production host 의 Studio CTA 는 절대 URL 이다")

const CTA_TARGETS: Array<[string, string]> = [
  ["/studio", "/"],
  ["/studio/sign-in", "/auth/sign-in"],
  ["/studio/sign-up", "/auth/sign-up"],
  ["/studio/billing", "/billing"]
]
for (const host of [PARENT_HOST, WWW_HOST]) {
  for (const [internal, external] of CTA_TARGETS) {
    equals(`A) ${host} ${internal} → ${STUDIO_ORIGIN}${external}`, toStudio(host, internal), `${STUDIO_ORIGIN}${external}`)
  }
}
check("A) 전부 Studio origin 이다", CTA_TARGETS.every(([internal]) => toStudio(PARENT_HOST, internal).startsWith(`${STUDIO_ORIGIN}/`)))
check("A) 결과에 /studio prefix 가 남지 않는다", CTA_TARGETS.every(([internal]) => !new URL(toStudio(PARENT_HOST, internal)).pathname.startsWith("/studio")))

console.log("\n[B] localhost / 알 수 없는 host 는 기존 상대 경로")

for (const host of ["localhost", "localhost:3000", "127.0.0.1:3000", "studio.localhost", "", "unknown.example"]) {
  for (const [internal] of CTA_TARGETS) {
    equals(`B) ${JSON.stringify(host)} ${internal} → 그대로`, toStudio(host, internal), internal)
  }
}
check("B) localhost 결과에 production origin 이 섞이지 않는다", CTA_TARGETS.every(([internal]) => !toStudio("localhost:3000", internal).includes("://")))

console.log("\n[이전] Parent UI 에 상대 /studio 링크가 남지 않았다")

/* Parent · Admin 화면 전체를 훑는다. Studio 가 소유한 파일은 S3F 몫이다. */
const parentSurfaceFiles = sourceFiles.filter(
  (file) =>
    !file.startsWith("app/studio/") &&
    !file.startsWith("src/features/studio/") &&
    !file.startsWith("src/features/reservation-import/") &&
    !file.startsWith("src/shared/config/") &&
    !file.startsWith("src/shared/lib/")
)
const leftoverHrefs = parentSurfaceFiles.filter((file) => /href="\/studio|href=\{`\/studio/.test(codeOf(file)))
check("이전) Parent UI 에 하드코딩된 /studio href 가 없다", leftoverHrefs.length === 0, leftoverHrefs.join(", "))
const leftoverLiterals = parentSurfaceFiles.filter((file) => /(redirect|redirectTo:|myPageHref=)\s*\(?\s*"\/studio"/.test(codeOf(file)))
check("이전) Parent UI 에 상대 /studio 이동이 없다", leftoverLiterals.length === 0, leftoverLiterals.join(", "))

const MIGRATED_SITES = [
  "app/page.tsx",
  "app/classes/page.tsx",
  "app/classes/[id]/page.tsx",
  "app/classes/[id]/apply/page.tsx",
  "app/academies/page.tsx",
  FAVORITES_PAGE,
  ACCOUNT_CONFLICT,
  PARTNER_LANDING,
  "src/features/applications/actions/create-trial-application.ts",
  "src/features/admin/lib/require-admin.ts",
  "app/admin/academy-approvals/page.tsx"
]
for (const file of MIGRATED_SITES) {
  check(`이전) ${file} 가 cross-product helper 를 쓴다`, codeOf(file).includes("CrossProductHref"))
}
/* 한 화면에서 hostname 을 여러 번 읽지 않는다. */
for (const file of ["app/page.tsx", "app/classes/page.tsx", "app/academies/page.tsx", FAVORITES_PAGE, PARTNER_LANDING]) {
  check(
    `이전) ${file} 는 resolver 를 한 번만 받는다`,
    (codeOf(file).match(/getStudioCrossProductHrefResolver\(\)/g) ?? []).length === 1
  )
}

console.log("\n[client] client 가 render 중에 host 를 읽지 않는다")

check("client) favorites 는 서버가 고른 값을 prop 으로 받는다", codeOf(FAVORITES_CLIENT).includes("props.studioHref"))
check("client) favorites page 가 prop 을 내려준다", codeOf(FAVORITES_PAGE).includes('studioHref={studioHref("/studio")}'))
check("client) favorites client 는 host 를 읽지 않는다", !/window\.location\.(hostname|host)\b/.test(codeOf(FAVORITES_CLIENT)))
/* Parent 쪽 client 어디에서도 host 를 직접 읽지 않는다. */
const windowHostReaders = parentSurfaceFiles.filter(
  (file) => isClientFile(file) && /window\.location\.(hostname|host)\b/.test(codeOf(file))
)
check("client) Parent client 코드에 window.location.hostname 사용이 없다", windowHostReaders.length === 0, windowHostReaders.join(", "))
check("client) client 가 cross-product helper 를 직접 부르지 않는다", (() => {
  const callers = parentSurfaceFiles.filter((file) => isClientFile(file) && codeOf(file).includes("cross-product-navigation"))
  return callers.length === 0
})())

console.log("\n[server helper] 기존 계약을 재사용한다")

const crossServer = codeOf(CROSS_PRODUCT_SERVER)
check("helper) server resolver 가 있다", exists(CROSS_PRODUCT_SERVER))
check("helper) server-only 다", read(CROSS_PRODUCT_SERVER).includes('import "server-only"'))
check("helper) getRequestHostname 을 쓴다", crossServer.includes("getRequestHostname"))
check("helper) S3E pure helper 를 재사용한다", crossServer.includes("getStudioCrossProductHref"))
check("helper) 경로를 다시 매핑하지 않는다", !/"\/studio\//.test(crossServer) && !crossServer.includes("firstsuup.com"))
check("helper) pure helper 는 toStudioUrl · toStudioExternalPath 를 쓴다", (() => {
  const pure = codeOf(CROSS_PRODUCT)
  return pure.includes("toStudioUrl") && pure.includes("toStudioExternalPath")
})())

console.log("\n[C] Parent 로그인 화면에 Studio CTA 를 다시 만들지 않았다")

for (const file of [PARENT_SIGN_IN, PARENT_SIGN_IN_FORM, "app/auth/sign-in/email/page.tsx"]) {
  const code = codeOf(file)
  check(`C) ${file} 에 /studio 가 없다`, !code.includes("/studio"))
  for (const term of ["학원 로그인", "선생님 로그인", "선생님·학원 관리자이신가요", "선생님/학원 관리자이신가요"]) {
    check(`C) ${file} 에 "${term}" 문구가 없다`, !code.includes(term))
  }
  check(`C) ${file} 이 cross-product helper 를 쓰지 않는다`, !code.includes("cross-product-navigation"))
}

console.log("\n[D] account-conflict")

const accountConflict = codeOf(ACCOUNT_CONFLICT)
check("D) Studio 로그인으로 보낸다", accountConflict.includes('resolveStudioCrossProductHref("/studio/sign-in")'))
check("D) 상대 /studio/sign-in 이 남아 있지 않다", !accountConflict.includes('href="/studio/sign-in"'))
equals("D) production 목적지", toStudio(PARENT_HOST, "/studio/sign-in"), `${STUDIO_ORIGIN}/auth/sign-in`)
equals("D) localhost 목적지", toStudio("localhost:3000", "/studio/sign-in"), "/studio/sign-in")
/* studio_account 분기 자체는 그대로다. */
check("D) studio_account 분기가 그대로다", accountConflict.includes('reason === "studio_account"'))
check("D) 이메일 로그인 분기는 Parent 안에 남는다", accountConflict.includes('href="/auth/sign-in/email"'))

console.log("\n[E-G] Partner landing CTA 3개")

const partner = codeOf(PARTNER_LANDING)
check("E) 로그인 CTA 가 helper 를 거친다", partner.includes('studioHref("/studio/sign-in")'))
check("F) 계정 신청 CTA 가 helper 를 거친다", partner.includes('studioHref("/studio/sign-up")'))
check("G) 요금제 CTA 가 helper 를 거친다", partner.includes('studioHref("/studio/billing")'))
check("E-G) 상대 /studio href 가 남아 있지 않다", !/href="\/studio/.test(partner))
equals("E) production 로그인 목적지", toStudio(PARENT_HOST, "/studio/sign-in"), `${STUDIO_ORIGIN}/auth/sign-in`)
equals("F) production 가입 목적지", toStudio(PARENT_HOST, "/studio/sign-up"), `${STUDIO_ORIGIN}/auth/sign-up`)
equals("G) production 요금제 목적지", toStudio(PARENT_HOST, "/studio/billing"), `${STUDIO_ORIGIN}/billing`)
/* /partner 자리 자체는 이번 단계에서 옮기지 않는다. */
check("E-G) /partner route 가 그대로 있다", exists("app/partner/page.tsx"))
check("E-G) partner 는 여전히 Parent 웹에 있다", !exists("app/studio/partner/page.tsx"))

console.log("\n[H] S3E requireParentAccess 계약 유지")

const parentGuard = codeOf(PARENT_GUARD)
check("H) role_mismatch 는 cross-product helper 를 쓴다", parentGuard.includes("getStudioCrossProductHref"))
check("H) same-host /studio redirect 가 없다", !parentGuard.includes('redirect("/studio")'))
check("H) no_user 는 여전히 Parent 로그인으로 간다", parentGuard.includes("/auth/sign-in?returnTo="))
check("H) profile_error 는 여전히 Parent Home 으로 간다", parentGuard.includes('redirect("/")'))
check("H) 이번 단계에서 다시 설계하지 않았다", parentGuard.includes("resolveCurrentAuth"))

console.log("\n[I] Studio→Parent 계약 유지 (S3E · S4A)")

const studioGuard = codeOf(STUDIO_GUARD)
check("I) parent role 은 Parent origin 으로 나간다", studioGuard.includes("getParentCrossProductHref"))
check("I) same-host /classes 가 없다", !studioGuard.includes('redirect("/classes")'))
for (const file of ["app/studio/sign-in/page.tsx", "app/studio/sign-up/page.tsx", "app/studio/pending/page.tsx", "app/studio/access/page.tsx"]) {
  check(`I) ${file} 의 Studio→Parent 이동이 그대로다`, codeOf(file).includes("getParentCrossProductHref"))
}
/* S4A 복귀 링크도 그대로다. */
for (const file of ["app/auth/find-email/find-email-client.tsx", "app/auth/reset-password/reset-password-client.tsx", "app/auth/recovery/recovery-confirm-client.tsx", "app/auth/update-password/page.tsx"]) {
  check(`I) ${file} 의 복귀 링크가 그대로다`, codeOf(file).includes('useParentCrossProductHref("/auth/sign-in")'))
}
check("I) 공용 auth 경로 passthrough 가 그대로다", codeOf("src/shared/config/studio-host-rewrite.ts").includes("isStudioSharedAuthPath"))

console.log("\n[J] middleware 무변경")

check("J) host rewrite 계약 그대로", middleware.includes("resolveStudioRewritePathname"))
check("J) canonical redirect 계약 그대로", middleware.includes("resolveStudioCanonicalRedirectUrl"))
check("J) response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("J) cookie 전파 계약 그대로", middleware.includes("takePendingCookies()") && middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))
check("J) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  middleware.slice(middleware.indexOf("matcher: [")).split("\n").some((row) => row.trim() === `"${source}",`)
))
check("J) middleware 가 cross-product helper 를 쓰지 않는다", !middleware.includes("cross-product-navigation"))
for (const [label, code] of [[MIDDLEWARE, middleware], [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)], [SUPABASE_SERVER, codeOf(SUPABASE_SERVER)]] as const) {
  check(`J) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
}

console.log("\n[K] Toss 무변경")

const toss = codeOf(TOSS_CHECKOUT)
check('K) CALLBACK_PATH 가 "/studio/billing/callback" 이다', toss.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
check('K) FAIL_PATH 가 "/studio/billing" 이다', toss.includes('const FAIL_PATH = "/studio/billing"'))
/* S4C: 결제 복귀 주소는 이제 host 에 맞춰 만들어진다. 내부 경로 상수와
   실패 query 는 그대로다. 자세한 계약은 verify-studio-billing-callback-routing. */
check("K) successUrl 은 요청 origin 과 callback 경로로 만들어진다", toss.includes("successUrl: toCallbackUrl(CALLBACK_PATH)"))
check("K) 실패 query 가 그대로다", toss.includes("?billing=failed"))
check("K) checkout 이 cross-product helper 를 쓰지 않는다", !toss.includes("cross-product-navigation"))
check("K) billing callback route 가 그대로 있다", exists("app/studio/(dashboard)/billing/callback/page.tsx"))

console.log("\n[L] auth · RLS 무변경")

const AUTH_FILES = [
  "src/features/auth/lib/profile-sync.ts",
  "src/features/auth/lib/session.ts",
  "src/features/auth/lib/redirect.ts",
  "src/features/auth/lib/current-auth.ts",
  "app/auth/callback/route.ts"
]
for (const file of AUTH_FILES) {
  check(`L) ${file} 가 그대로 있다`, exists(file))
  check(`L) ${file} 가 host 로 권한을 판단하지 않는다`, !read(file).includes("isStudioHost") && !read(file).includes("isParentHost"))
  check(`L) ${file} 가 cross-product helper 를 쓰지 않는다`, !read(file).includes("cross-product-navigation"))
}
check("L) resolvePostAuthRedirect 계약이 그대로다", codeOf("src/features/auth/lib/redirect.ts").includes('return "/studio"'))
check("L) OAuth callback 이 요청 origin 안에서만 돈다", (() => {
  const callback = codeOf("app/auth/callback/route.ts")
  const redirects = Array.from(callback.matchAll(/NextResponse\.redirect\(\s*new URL\(([\s\S]*?)\)\s*\)/g))
  return redirects.length > 0 && redirects.every((match) => match[1].includes("requestUrl.origin"))
})())
check("L) role 판정은 여전히 profile 로 한다", (() => {
  const admin = read("src/features/admin/lib/require-admin.ts")
  return admin.includes("getMyProfile") && admin.includes('profile.dbRole !== "admin"')
})())
check("L) DB 마이그레이션을 건드리지 않았다", walk("supabase/migrations").filter((file) => file.endsWith(".sql")).every((file) => !read(file).includes("cross-product")))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
