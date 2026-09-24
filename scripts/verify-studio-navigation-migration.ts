// Studio same-product navigation 이전 검증 (STUDIO SUBDOMAIN S3F).
//
//   npx tsx scripts/verify-studio-navigation-migration.ts
//
// 여기서 고정하는 것.
//   A. Studio production host → clean external path
//   B. localhost / 알 수 없는 host → 기존 /studio path
//   C. Server navigation 은 공용 resolver 로 hostname 을 재사용한다.
//   D. Client 는 render 중에 window 를 읽지 않는다 — layout 이 내려준 값을 쓴다.
//   E. router.push 도 같은 helper 를 거친다.
//   F. 사용자 navigation 에 하드코딩된 /studio href 가 줄었다.
//   G. revalidatePath 무변경
//   H. middleware internal /studio target 무변경
//   I. Toss callback 무변경
//   J. S3E cross-product 계약 유지
//   K. S3C canonical redirect 계약 유지
//
// 그리고 provider 계약 —
//   server layout 이 hostname 을 요청당 한 번 읽어 client tree 로 내려주고,
//   서버가 처음 내려주는 HTML 부터 최종 href 가 나온다. hydration 이후에
//   href 가 바뀌는 2-pass 방식을 쓰지 않는다.
//
// 소스 검사 + 순수 함수 호출만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { STUDIO_ORIGIN } from "@/shared/config/site-origins"
import { getStudioNavigationPath } from "@/shared/config/studio-navigation"

const STUDIO_LAYOUT = "app/studio/layout.tsx"
const PROVIDER = "src/features/studio/ui/studio-navigation-provider.tsx"
const REQUEST_HOST = "src/shared/lib/request-host.ts"
const NAV_SERVER = "src/shared/lib/studio-navigation-server.ts"
const NAV_PURE = "src/shared/config/studio-navigation.ts"
const STUDIO_SHELL = "src/features/studio/ui/studio-shell.tsx"
const STUDIO_GUARD = "src/features/studio/lib/require-teacher-studio-access.ts"
const MIDDLEWARE = "middleware.ts"
const TOSS_CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"
const SIGN_OUT_ROUTE = "app/studio/sign-out/route.ts"
const APPLICATION_TABLE = "src/features/studio/ui/studio-application-table.tsx"

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

const STUDIO_HOST = new URL(STUDIO_ORIGIN).hostname
const nav = (hostname: string, internalPath: string) => getStudioNavigationPath({ internalPath, hostname })

console.log("[A-B] host 별 경로")

const MIGRATED: Array<[string, string]> = [
  ["/studio", "/"],
  ["/studio/cases", "/cases"],
  ["/studio/cases/import", "/cases/import"],
  ["/studio/cases/import/template", "/cases/import/template"],
  ["/studio/classes", "/classes"],
  ["/studio/classes/new", "/classes/new"],
  ["/studio/applications", "/applications"],
  ["/studio/schedule", "/schedule"],
  ["/studio/teachers", "/teachers"],
  ["/studio/unregistered", "/unregistered"],
  ["/studio/mypage", "/mypage"],
  ["/studio/mypage/profile", "/mypage/profile"],
  ["/studio/settings", "/settings"],
  ["/studio/billing", "/billing"],
  ["/studio/access", "/access"],
  ["/studio/pending", "/pending"],
  ["/studio/sign-in", "/auth/sign-in"],
  ["/studio/sign-up", "/auth/sign-up"],
  ["/studio/sign-out", "/auth/sign-out"]
]
for (const [internal, external] of MIGRATED) {
  equals(`A) ${STUDIO_HOST} ${internal} → ${external}`, nav(STUDIO_HOST, internal), external)
}
for (const host of ["localhost", "localhost:3000", "127.0.0.1:3000", "studio.localhost", ""]) {
  for (const [internal] of MIGRATED) {
    equals(`B) ${JSON.stringify(host)} ${internal} → 그대로`, nav(host, internal), internal)
  }
}
/* localhost 에서 clean path 로 바뀌면 Parent route 와 충돌한다. */
check(
  "B) localhost 결과가 Parent route 와 충돌하지 않는다",
  ["/studio/classes", "/studio/applications", "/studio/schedule"].every(
    (internal) => nav("localhost:3000", internal).startsWith("/studio/")
  )
)

console.log("\n[provider] server 가 한 번 읽어 client 로 내려준다")

const layout = codeOf(STUDIO_LAYOUT)
const provider = codeOf(PROVIDER)
const requestHost = codeOf(REQUEST_HOST)

check("provider) app/studio/layout.tsx 가 있다", exists(STUDIO_LAYOUT))
check("provider) layout 은 server component 다", !isClientFile(STUDIO_LAYOUT))
check("provider) layout 이 hostname 을 한 번만 읽는다", (layout.match(/getRequestHostname\(\)/g) ?? []).length === 1, String((layout.match(/getRequestHostname\(\)/g) ?? []).length))
check("provider) layout 이 provider 로 내려준다", /<StudioNavigationProvider hostname=\{await getRequestHostname\(\)\}>/.test(layout))
check("provider) layout 은 권한을 판단하지 않는다", ["requireTeacherStudioAccess", "role", "profiles", "supabase"].every((term) => !layout.includes(term)))
/* 요청당 한 번으로 못박는다 — 다른 server component 가 불러도 실제 읽기는 한 번이다. */
check("provider) getRequestHostname 이 cache() 로 감싸여 있다", requestHost.includes("export const getRequestHostname = cache(async ()"))
check("provider) provider 는 client component 다", isClientFile(PROVIDER))
check("provider) provider 가 context 로 hostname 을 넘긴다", provider.includes("StudioNavigationHostContext.Provider") && provider.includes("value={hostname}"))
check("provider) 훅이 pure helper 를 재사용한다", provider.includes("getStudioNavigationPath"))
check("provider) provider 가 auth/session/cookie 를 다루지 않는다", ["role", "profiles", "session", "cookie", "supabase"].every((term) => !provider.includes(term)))
/* 2-pass 금지 — hydration 이후 href 가 바뀌면 churn 과 prefetch 낭비가 생긴다. */
check("provider) provider 에 useEffect 2-pass 가 없다", !provider.includes("useEffect") && !provider.includes("useState"))
check("provider) provider 가 window 를 읽지 않는다", !provider.includes("window"))

console.log("\n[C] server navigation 은 공용 resolver 를 쓴다")

const navServer = codeOf(NAV_SERVER)
check("C) server resolver 가 있다", exists(NAV_SERVER))
check("C) server resolver 는 server-only 다", read(NAV_SERVER).includes('import "server-only"'))
check("C) server resolver 가 getRequestHostname 을 쓴다", navServer.includes("getRequestHostname"))
check("C) server resolver 가 pure helper 를 재사용한다", navServer.includes("getStudioNavigationPath"))
check("C) server resolver 는 경로를 다시 매핑하지 않는다", !/"\/studio\//.test(navServer))

const SERVER_NAV_SITES = [
  "app/studio/(dashboard)/page.tsx",
  "app/studio/(dashboard)/cases/page.tsx",
  "app/studio/(dashboard)/classes/page.tsx",
  "app/studio/(dashboard)/applications/[id]/page.tsx",
  "app/studio/(dashboard)/billing/callback/page.tsx",
  "app/studio/access/page.tsx",
  "app/studio/pending/page.tsx",
  "app/studio/sign-in/page.tsx",
  "app/studio/sign-up/page.tsx",
  "src/features/studio/ui/studio-mypage-page.tsx",
  "src/features/studio/ui/unregistered-students-manager.tsx",
  "src/features/studio/lib/require-teacher-studio-access.ts",
  SIGN_OUT_ROUTE
]
for (const file of SERVER_NAV_SITES) {
  const code = codeOf(file)
  check(`C) ${file} 가 server resolver 를 쓴다`, code.includes("StudioNavigationPath"))
  check(`C) ${file} 에 하드코딩된 /studio href 가 없다`, !/href="\/studio/.test(code))
}
/* query 는 path helper 에 넣지 않는다. */
check("C) access reason 은 URLSearchParams 로 붙인다", codeOf(STUDIO_GUARD).includes("new URLSearchParams({ reason })"))
check("C) billing 결과도 URLSearchParams 로 붙인다", codeOf("app/studio/(dashboard)/billing/callback/page.tsx").includes("new URLSearchParams({ billing: outcome })"))
check("C) guard 는 resolver 를 한 번만 받는다", (codeOf(STUDIO_GUARD).match(/getStudioNavigationPathResolver\(\)/g) ?? []).length === 1)

console.log("\n[D] client 는 render 중에 window 를 읽지 않는다")

const clientFiles = sourceFiles.filter((file) => /\.tsx?$/.test(file) && isClientFile(file))
const windowHostReaders = clientFiles.filter((file) => /window\.location\.(hostname|host)\b/.test(codeOf(file)))
check("D) client 코드에 window.location.hostname 사용이 없다", windowHostReaders.length === 0, windowHostReaders.join(", "))
/*
 * navigation 값이 window 에서 오지 않는다.
 *
 * ⚠️ 여기서 보는 것은 "href 를 window 로 계산하는가" 다. scroll · matchMedia
 *    같은 기존 typeof window 가드는 navigation 과 무관하므로 건드리지 않는다.
 */
const windowFedNav = clientFiles.filter((file) =>
  /(useStudioNavigationPath(Factory)?|getStudioNavigationPath)\([^)]*window/.test(codeOf(file))
)
check("D) navigation 값이 window 에서 오지 않는다", windowFedNav.length === 0, windowFedNav.join(", "))
/* client 는 pure helper 를 직접 부르지 않는다 — provider 가 준 hostname 만 쓴다. */
const directPureCallers = clientFiles.filter(
  (file) => file !== PROVIDER && codeOf(file).includes("getStudioNavigationPath(")
)
check("D) client 가 pure helper 를 직접 부르지 않는다", directPureCallers.length === 0, directPureCallers.join(", "))

const CLIENT_NAV_SITES = [
  "app/studio/(dashboard)/classes/error.tsx",
  "src/features/reservation-import/ui/reservation-import-workspace.tsx",
  "src/features/studio/ui/studio-class-form.tsx",
  "src/features/studio/ui/studio-classes-manager.tsx",
  "src/features/studio/ui/studio-mypage-profile-page.tsx",
  "src/features/studio/ui/studio-sign-in-form.tsx",
  "src/features/studio/ui/studio-sign-up-form.tsx",
  "src/features/studio/ui/studio-home-logo.tsx",
  "src/features/studio/ui/studio-teacher-filter.tsx",
  "src/features/studio/ui/studio-schedule-day-panel.tsx",
  STUDIO_SHELL,
  APPLICATION_TABLE
]
// Class Form V1: the legacy entry delegates all UI/navigation to the shared form.
check("D) 이전 등록 entry 가 공통 Form 에 위임한다", codeOf("src/features/studio/ui/studio-class-create-wizard.tsx").includes("<StudioClassForm"))
for (const file of CLIENT_NAV_SITES) {
  const code = codeOf(file)
  check(`D) ${file} 가 provider 훅을 쓴다`, /useStudioNavigationPath(Factory)?\(/.test(code))
  check(`D) ${file} 에 하드코딩된 /studio href 가 없다`, !/href="\/studio/.test(code) && !/href=\{`\/studio/.test(code))
  check(`D) ${file} 이 경로 매핑을 다시 만들지 않는다`, !code.includes("STUDIO_INTERNAL_PREFIX") || file === STUDIO_SHELL)
}

console.log("\n[D] Studio shell 의 active 표시가 hydration 에서 흔들리지 않는다")

const shell = codeOf(STUDIO_SHELL)
/* 주소창(/cases)과 내부 route(/studio/cases)가 다르다. 비교는 한쪽 공간으로 모은다. */
check("D) shell 이 현재 경로를 내부 공간으로 정규화한다", shell.includes("useStudioInternalPathname()"))
/* 정규화도 contract 계층에 있다. 화면이 studio-routes 를 직접 부르지 않는다. */
check("D) shell 이 studio-routes 를 직접 부르지 않는다", !shell.includes("studio-routes"))
check("D) 정규화가 S3A contract 를 쓴다", codeOf(NAV_PURE).includes("toStudioInternalNavigationPath") && codeOf(NAV_PURE).includes("toStudioInternalPath"))
check("D) 정규화 훅이 provider 에 있다", provider.includes("export const useStudioInternalPathname") && provider.includes("toStudioInternalNavigationPath"))
check("D) nav item 은 내부 경로로 비교한다", shell.includes("isActivePath(pathname, item.href)"))
check("D) nav item 의 href 만 host 에 맞춰 나간다", shell.includes("href={studioPath(item.href)}"))
check("D) 마이페이지 링크도 같은 방식이다", shell.includes("href={studioPath(mypageHref)}") && shell.includes("isActivePath(pathname, mypageHref)"))
check("D) shell 이 window 를 읽지 않는다", !shell.includes("window.location"))

console.log("\n[E] router.push 도 같은 helper 를 거친다")

const applicationTable = codeOf(APPLICATION_TABLE)
check("E) router.push 가 helper 를 거친다", applicationTable.includes("router.push(studioPath(`/studio/applications/${applicationId}`))"))
const rawRouterPushes = sourceFiles.filter((file) => /router\.(push|replace)\(\s*[`"']\/studio/.test(codeOf(file)))
check("E) helper 를 거치지 않는 router.push 가 없다", rawRouterPushes.length === 0, rawRouterPushes.join(", "))

console.log("\n[F] 사용자 navigation 의 하드코딩 /studio href 가 줄었다")

/* Studio 내부 화면에는 하드코딩된 /studio href 가 남지 않는다. */
const studioOwnedFiles = sourceFiles.filter(
  (file) => file.startsWith("app/studio/") || file.startsWith("src/features/studio/") || file.startsWith("src/features/reservation-import/")
)
const leftoverHrefs = studioOwnedFiles.filter((file) => /href="\/studio|href=\{`\/studio/.test(codeOf(file)))
check("F) Studio 화면에 하드코딩된 /studio href 가 없다", leftoverHrefs.length === 0, leftoverHrefs.join(", "))
const leftoverRedirects = studioOwnedFiles.filter((file) => /redirect\(\s*[`"']\/studio/.test(codeOf(file)))
check("F) Studio 화면에 하드코딩된 /studio redirect 가 없다", leftoverRedirects.length === 0, leftoverRedirects.join(", "))
check("F) sign-out route 도 helper 를 거친다", codeOf(SIGN_OUT_ROUTE).includes("resolveStudioNavigationPath"))
check("F) sign-out route 는 같은 origin 안에서 움직인다", codeOf(SIGN_OUT_ROUTE).includes("request.url"))

/* S4B 에서 Parent→Studio CTA 도 cross-product helper 로 옮겨갔다.
   자세한 계약은 verify-parent-studio-cta-migration 이 본다. */
const PARENT_TO_STUDIO = [
  "app/page.tsx",
  "app/classes/page.tsx",
  "app/partner/PartnerLanding.tsx",
  "app/auth/account-conflict/page.tsx"
]
for (const file of PARENT_TO_STUDIO) {
  const code = read(file)
  check(`F) ${file} 의 Parent→Studio CTA 가 helper 를 거친다`, code.includes("CrossProductHref"))
  check(`F) ${file} 에 상대 /studio href 가 남아 있지 않다`, !/href="\/studio/.test(code))
}

console.log("\n[G] revalidatePath 무변경")

const revalidateCalls = sourceFiles.flatMap((file) =>
  Array.from(read(file).matchAll(/revalidatePath\("([^"]*)"\)/g)).map((match) => match[1])
)
const studioRevalidates = revalidateCalls.filter((target) => target.startsWith("/studio"))
check("G) Studio revalidatePath 호출 수가 그대로다", studioRevalidates.length === 72, `${studioRevalidates.length}개`)
const revalidateTargets = Array.from(new Set(studioRevalidates)).sort()
check("G) 고유 경로가 9개 그대로다", revalidateTargets.length === 9, revalidateTargets.join(", "))
for (const target of ["/studio", "/studio/applications", "/studio/classes", "/studio/schedule", "/studio/teachers", "/studio/billing", "/studio/cases", "/studio/settings", "/studio/mypage/profile"]) {
  check(`G) ${target} 가 그대로다`, revalidateTargets.includes(target))
}
/* 내부 route key 다. navigation helper 를 끼우면 캐시가 엉뚱한 자리를 턴다. */
check("G) revalidatePath 인자가 전부 리터럴이다", !sourceFiles.some((file) => /revalidatePath\(\s*(studioPath|await|resolveStudioNavigationPath)/.test(read(file))))

console.log("\n[H] middleware internal target 무변경")

check("H) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  middleware.slice(middleware.indexOf("matcher: [")).split("\n").some((row) => row.trim() === `"${source}",`)
))
check("H) host rewrite 계약 그대로", middleware.includes("resolveStudioRewritePathname"))
check("H) response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("H) cookie 전파 계약 그대로", middleware.includes("takePendingCookies()"))
check("H) middleware 가 navigation helper 를 쓰지 않는다", !middleware.includes("studio-navigation"))

console.log("\n[I] Toss callback 무변경")

const tossCheckout = codeOf(TOSS_CHECKOUT)
check('I) CALLBACK_PATH 가 "/studio/billing/callback" 이다', tossCheckout.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
check('I) FAIL_PATH 가 "/studio/billing" 이다', tossCheckout.includes('const FAIL_PATH = "/studio/billing"'))
check("I) Toss checkout 이 navigation helper 를 쓰지 않는다", !tossCheckout.includes("studio-navigation"))
check("I) Supabase OAuth callback 이 그대로다", (() => {
  const callback = codeOf("app/auth/callback/route.ts")
  return callback.includes("supabase.auth.exchangeCodeForSession(code)") && !callback.includes("studio-navigation")
})())

console.log("\n[J] S3E cross-product 계약 유지")

const guard = codeOf(STUDIO_GUARD)
check("J) parent role 은 cross-product helper 로 나간다", guard.includes("getParentCrossProductHref"))
check("J) same-host /classes 가 남아 있지 않다", !guard.includes('redirect("/classes")'))
check("J) require-parent-access 계약 그대로", codeOf("src/features/my/lib/require-parent-access.ts").includes("getStudioCrossProductHref"))
for (const file of ["app/studio/sign-in/page.tsx", "app/studio/sign-up/page.tsx", "app/studio/pending/page.tsx", "app/studio/access/page.tsx"]) {
  check(`J) ${file} 의 cross-product 이동이 그대로다`, codeOf(file).includes("getParentCrossProductHref"))
}

console.log("\n[K] S3C canonical redirect 계약 유지")

check("K) canonical redirect 가 그대로다", middleware.includes("resolveStudioCanonicalRedirectUrl"))
check("K) 307 temporary 그대로", middleware.includes("const LEGACY_REDIRECT_STATUS = 307"))
/* 누락된 /studio 링크가 있어도 canonical redirect 가 받아준다. */
check("K) legacy fallback 이 살아 있다", exists("src/shared/config/studio-host-rewrite.ts") && codeOf("src/shared/config/studio-host-rewrite.ts").includes("resolveStudioCanonicalRedirectUrl"))

console.log("\n[pure] 경로 규칙은 한 곳에만 있다")

const navPure = codeOf(NAV_PURE)
check("pure) navigation helper 가 toStudioExternalPath 를 쓴다", navPure.includes("toStudioExternalPath"))
for (const term of ["next/headers", "next/navigation", "window", "process.env", "server-only"]) {
  check(`pure) navigation helper 가 ${term} 에 의존하지 않는다`, !navPure.includes(term))
}
/* 각 화면이 매핑을 다시 만들지 않는다. */
const reimplementers = sourceFiles.filter(
  (file) => file !== NAV_PURE && file !== "src/shared/config/studio-routes.ts" && /replace\(\s*["'`]\/studio["'`]/.test(read(file))
)
check("pure) 경로 매핑을 다시 만든 곳이 없다", reimplementers.length === 0, reimplementers.join(", "))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
