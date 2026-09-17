// Studio navigation contract 검증 (STUDIO SUBDOMAIN S3D).
//
//   npx tsx scripts/verify-studio-navigation-contract.ts
//
// 여기서 고정하는 것.
//   A. Studio host + /studio/classes → /classes
//   B. Studio host + /studio         → /
//   C. localhost + /studio/classes   → /studio/classes
//   D. 알 수 없는 host + /studio/classes → /studio/classes
//   E. Parent→Studio 를 이 relative helper 로 처리하지 않는다.
//   F. 경로 변환은 toStudioExternalPath 를 재사용한다.
//   G. revalidatePath("/studio/...") 무변경
//   H. Toss callback 무변경
//   I. middleware rewrite 무변경
//   J. auth / role / cookie 무변경
//
// S3D 는 "runtime navigation 변화 0" 이었다. Studio 내부 same-product
// navigation(href · router.push · redirect)은 아직 그대로다 — S3F 대상이다.
//
// 여기에 navigation inventory 도 함께 못박는다. 특히 Studio→Parent 이동은
// Studio host 에서 relative path 로는 표현할 수 없다(/classes 가 다시 Studio
// 로 rewrite 된다). S3E 가 그 6곳을 cross-product helper 로 옮겼고, 자세한
// 계약은 verify-cross-product-navigation 이 본다. 여기서는 그 자리들이
// relative path 로 되돌아가지 않는지만 지킨다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { PARENT_ORIGIN, STUDIO_ORIGIN, toParentUrl, toStudioUrl } from "@/shared/config/site-origins"
import { getStudioNavigationPath } from "@/shared/config/studio-navigation"
import { toStudioExternalPath } from "@/shared/config/studio-routes"

const NAVIGATION = "src/shared/config/studio-navigation.ts"
const MIDDLEWARE = "middleware.ts"
const HOST_REWRITE = "src/shared/config/studio-host-rewrite.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const SUPABASE_SERVER = "src/integrations/supabase/server.ts"
const TOSS_CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"
const STUDIO_ACCESS_GUARD = "src/features/studio/lib/require-teacher-studio-access.ts"

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
const sourceFiles = ["app", "src"].flatMap(walk).concat(MIDDLEWARE).filter((file) => /\.(ts|tsx)$/.test(file))

const navigation = codeOf(NAVIGATION)
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
const nav = (hostname: string, internalPath: string) => getStudioNavigationPath({ internalPath, hostname })

console.log("[A-B] Studio production host 에서는 clean external path")

const CLEAN: Array<[string, string]> = [
  ["/studio", "/"],
  ["/studio/classes", "/classes"],
  ["/studio/classes/new", "/classes/new"],
  ["/studio/classes/abc/edit", "/classes/abc/edit"],
  ["/studio/applications", "/applications"],
  ["/studio/applications/abc", "/applications/abc"],
  ["/studio/cases", "/cases"],
  ["/studio/cases/import", "/cases/import"],
  ["/studio/cases/import/template", "/cases/import/template"],
  ["/studio/schedule", "/schedule"],
  ["/studio/teachers", "/teachers"],
  ["/studio/billing", "/billing"],
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

for (const [internal, external] of CLEAN) {
  equals(`A-B) ${STUDIO_HOST} ${internal} → ${external}`, nav(STUDIO_HOST, internal), external)
}
/* host 표기가 흔들려도 같은 결과여야 한다. */
for (const host of [STUDIO_HOST.toUpperCase(), `${STUDIO_HOST}:443`, `${STUDIO_HOST}.`]) {
  equals(`A-B) ${host} /studio/classes → /classes`, nav(host, "/studio/classes"), "/classes")
}
check("A-B) 결과에 /studio prefix 가 남지 않는다", CLEAN.every(([internal]) => !nav(STUDIO_HOST, internal).startsWith("/studio")))
check("A-B) 중복 slash 가 없다", CLEAN.every(([internal]) => !nav(STUDIO_HOST, internal).includes("//")))

console.log("\n[C-D] localhost · 알 수 없는 host 는 기존 경로를 그대로 쓴다")

/* 개발 환경에서 /classes 는 Parent 목록이다. 여기서 바꾸면 다른 제품으로 간다. */
const NON_STUDIO_HOSTS = ["localhost", "localhost:3000", "127.0.0.1:3000", "studio.localhost", "", "evil.com", "studio.firstsuup.com.evil.com"]
for (const host of NON_STUDIO_HOSTS) {
  for (const [internal] of CLEAN) {
    equals(`C-D) ${JSON.stringify(host)} ${internal} → 그대로`, nav(host, internal), internal)
  }
}
/* studio.localhost 는 아직 runtime 계약이 아니다. 여기서 못박지 않는다. */
equals("C-D) studio.localhost 는 아직 Studio host 가 아니다", nav("studio.localhost", "/studio/classes"), "/studio/classes")
check("C-D) navigation helper 에 localhost 가 하드코딩되어 있지 않다", !navigation.includes("localhost"))

console.log("\n[E] Parent→Studio 는 이 relative helper 로 처리하지 않는다")

/* Parent host 에서는 clean path 를 만들지 않는다 — 만들면 Parent 화면으로 간다. */
for (const [internal] of CLEAN) {
  equals(`E) ${PARENT_HOST} ${internal} → 그대로`, nav(PARENT_HOST, internal), internal)
  equals(`E) www.${PARENT_HOST} ${internal} → 그대로`, nav(`www.${PARENT_HOST}`, internal), internal)
}
/* 이 helper 는 언제나 상대 경로만 돌려준다. 절대 주소는 site-origins 의 몫이다. */
check("E) 결과는 언제나 / 로 시작하는 상대 경로다", [...NON_STUDIO_HOSTS, PARENT_HOST, STUDIO_HOST].every((host) => nav(host, "/studio/classes").startsWith("/")))
check("E) 결과에 origin 이 섞이지 않는다", [...NON_STUDIO_HOSTS, PARENT_HOST, STUDIO_HOST].every((host) => !nav(host, "/studio/classes").includes("://")))
check("E) helper 가 origin 을 만들지 않는다", !navigation.includes("STUDIO_ORIGIN") && !navigation.includes("PARENT_ORIGIN") && !navigation.includes("toStudioUrl") && !navigation.includes("toParentUrl"))
/* cross-product 이동에 쓸 절대 helper 는 S1 것 그대로다. */
equals("E) cross-product 용 toStudioUrl 이 그대로 있다", toStudioUrl("/applications"), `${STUDIO_ORIGIN}/applications`)
equals("E) cross-product 용 toParentUrl 이 그대로 있다", toParentUrl("/classes"), `${PARENT_ORIGIN}/classes`)

console.log("\n[F] 경로 변환은 S3A contract 를 재사용한다")

check("F) toStudioExternalPath 를 쓴다", navigation.includes("toStudioExternalPath"))
check("F) host 판별은 S1 helper 를 쓴다", navigation.includes("isStudioHost"))
check("F) 경로를 다시 하드코딩하지 않았다", !/"\/studio\//.test(navigation) && !navigation.includes('"/auth/sign-'))
check("F) contract 와 결과가 일치한다", CLEAN.every(([internal, external]) => toStudioExternalPath(internal) === external))
/* 순수 모듈이어야 server · client 양쪽에서 쓸 수 있다. */
for (const term of ["next/headers", "next/navigation", "window", "process.env", "server-only", "headers()", "cookies()"]) {
  check(`F) helper 가 ${term} 에 의존하지 않는다`, !navigation.includes(term))
}
check("F) helper 가 session 을 읽지 않는다", !navigation.includes("supabase") && !navigation.includes("getSession"))
check("F) helper 는 던지지 않는다", (() => {
  for (const bad of ["/classes", "", "not-a-path", "//evil.com", "/studio//x"]) {
    try {
      const result = getStudioNavigationPath({ internalPath: bad, hostname: STUDIO_HOST })
      if (result !== bad) return false
    } catch {
      return false
    }
  }
  return true
})())

console.log("\n[runtime 변화 0] 아직 아무도 helper 를 쓰지 않는다")

const callers = sourceFiles.filter(
  (file) => file !== NAVIGATION && /from "(@\/shared\/config\/studio-navigation|\.\/studio-navigation)"/.test(read(file))
)
/* S3D 때는 아무도 안 썼다. S3F 에서 Studio navigation 이 이 helper 로 옮겨왔다. */
check("runtime) navigation helper 는 provider 와 server resolver 를 통해서만 쓰인다", (() => {
  const ENTRY_POINTS = [
    "src/features/studio/ui/studio-navigation-provider.tsx",
    "src/shared/lib/studio-navigation-server.ts",
    "src/features/studio/ui/studio-dashboard-period-control.tsx",
    /* S4C: 결제 복귀 주소는 절대 주소여야 해서 pure helper 를 직접 조합한다. */
    "src/features/billing/lib/callback-url.ts"
  ]
  return callers.every((file) => ENTRY_POINTS.includes(file))
})(), callers.join(", "))

console.log("\n[inventory] 기존 navigation 은 하나도 바뀌지 않았다")

const countMatches = (pattern: RegExp) =>
  sourceFiles.reduce((total, file) => total + (read(file).match(pattern) ?? []).length, 0)

/* 이번 단계에서 전수 교체를 하지 않았다는 것을 숫자로 못박는다. */
const staticHrefs = countMatches(/href="\/studio(?:\/[^"]*)?"/g)
const templateHrefs = countMatches(/href=\{`\/studio\//g)
const routerMoves = countMatches(/router\.(?:push|replace)\(`?\/studio/g)
const serverRedirects = countMatches(/redirect\(`?"?\/studio/g)

/* 남은 하드코딩은 전부 Parent→Studio CTA 다 — 이건 다음 단계 몫이다. */
/* S4B 에서 Parent→Studio CTA 까지 옮겼다. 하드코딩된 /studio href 는 남지 않는다. */
check("inventory) 하드코딩된 정적 /studio href 가 없다", staticHrefs === 0, `${staticHrefs}개`)
check("inventory) 동적 href 는 전부 옮겨졌다", templateHrefs === 0, `${templateHrefs}개`)
check("inventory) router 이동은 전부 옮겨졌다", routerMoves === 0, `${routerMoves}개`)
/* S3E 에서 require-parent-access 의 redirect("/studio") 하나가 cross-product helper 로 옮겨갔다. */
check("inventory) server redirect 는 전부 옮겨졌다", serverRedirects === 0, `${serverRedirects}개`)

console.log("\n[cross-product] Studio→Parent 는 relative path 로 표현할 수 없다")

/*
 * ⚠️ Studio host 에서 "/classes" 는 Parent 목록이 아니라 Studio classes 로
 *    rewrite 된다. 그래서 아래 자리들이 relative path 로 남아 있으면 parent
 *    계정을 Studio 안으로 되돌려보낸다 — 루프가 된다.
 *
 *    S3D 가 목록으로 고정했고 S3E 가 cross-product helper 로 옮겼다. 자세한
 *    계약은 verify-cross-product-navigation 이 본다. 여기서는 이 자리들이
 *    relative path 로 되돌아가지 않는지만 지킨다.
 */
const STUDIO_TO_PARENT = [
  STUDIO_ACCESS_GUARD,
  "app/studio/sign-in/page.tsx",
  "app/studio/sign-up/page.tsx",
  "app/studio/pending/page.tsx",
  "app/studio/access/page.tsx"
]
for (const file of STUDIO_TO_PARENT) {
  const code = codeOf(file)
  check(`cross) ${file} 가 cross-product helper 를 쓴다`, code.includes("getParentCrossProductHref"))
  check(`cross) ${file} 에 same-host /classes 가 남아 있지 않다`, !code.includes('redirect("/classes")') && !code.includes('href="/classes"'))
}
check(
  "cross) parent role 판정은 여전히 DB role 로 한다",
  read(STUDIO_ACCESS_GUARD).includes('redirectReason: "parent_role_redirect_classes"') &&
    read(STUDIO_ACCESS_GUARD).includes('normalized.dbRole === "parent"')
)
/* Parent→Studio 도 같은 이유로 절대 주소가 필요하다. */
const parentGuardCode = codeOf("src/features/my/lib/require-parent-access.ts")
check("cross) require-parent-access 가 cross-product helper 를 쓴다", parentGuardCode.includes("getStudioCrossProductHref"))
check("cross) same-host /studio redirect 가 남아 있지 않다", !parentGuardCode.includes('redirect("/studio")'))

console.log("\n[G] revalidatePath(\"/studio/...\") 무변경")

const revalidateTargets = Array.from(
  new Set(
    walk("src/features")
      .filter((file) => /\.ts$/.test(file))
      .flatMap((file) => Array.from(read(file).matchAll(/revalidatePath\("([^"]*)"\)/g)).map((match) => match[1]))
      .filter((target) => target.startsWith("/studio"))
  )
).sort()

check("G) Studio revalidatePath 대상이 남아 있다", revalidateTargets.length >= 9, revalidateTargets.join(", "))
for (const target of ["/studio", "/studio/applications", "/studio/classes", "/studio/schedule", "/studio/teachers", "/studio/billing", "/studio/cases", "/studio/settings", "/studio/mypage/profile"]) {
  check(`G) ${target} 가 그대로다`, revalidateTargets.includes(target))
}
/* 내부 route key 다. navigation helper 를 여기에 끼우면 캐시가 엉뚱한 자리를 턴다. */
/* helper 를 쓰는 파일이 있는 건 괜찮다. revalidatePath 인자에 끼우는 것이 안 된다. */
check(
  "G) revalidatePath 인자에 navigation helper 를 끼우지 않는다",
  !walk("src/features").some(
    (file) => /\.ts$/.test(file) && /revalidatePath\(\s*(studioPath|await|getStudioNavigationPath|resolveStudioNavigationPath)/.test(read(file))
  )
)

console.log("\n[H] Toss callback 무변경")

const tossCheckout = codeOf(TOSS_CHECKOUT)
check('H) CALLBACK_PATH 가 "/studio/billing/callback" 이다', tossCheckout.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
/* S4C: 결제 복귀 주소는 이제 host 에 맞춰 만들어진다. 내부 경로 상수와
   실패 query 는 그대로다. 자세한 계약은 verify-studio-billing-callback-routing. */
check("H) successUrl 은 요청 origin 과 callback 경로로 만들어진다", tossCheckout.includes("successUrl: toCallbackUrl(CALLBACK_PATH)"))
check("H) failUrl 도 같은 방식이고 실패 query 가 그대로다", tossCheckout.includes("failUrl: `${toCallbackUrl(FAIL_PATH)}?billing=failed`"))
check("H) Toss checkout 이 navigation helper 를 쓰지 않는다", !tossCheckout.includes("studio-navigation"))
check("H) billing callback route 가 그대로 있다", exists("app/studio/(dashboard)/billing/callback/page.tsx"))
check("H) Supabase OAuth callback 이 그대로다", read("app/auth/callback/route.ts").includes("supabase.auth.exchangeCodeForSession(code)") && !read("app/auth/callback/route.ts").includes("studio-navigation"))

console.log("\n[I] middleware rewrite · redirect 무변경")

check("I) middleware 가 navigation helper 를 쓰지 않는다", !middleware.includes("studio-navigation"))
check("I) rewrite 는 host-rewrite contract 가 정한다", middleware.includes("resolveStudioRewritePathname"))
check("I) canonical redirect 도 그대로다", middleware.includes("resolveStudioCanonicalRedirectUrl"))
check("I) response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("I) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  middleware.slice(middleware.indexOf("matcher: [")).split("\n").some((row) => row.trim() === `"${source}",`)
))
check("I) host-rewrite 가 navigation helper 를 쓰지 않는다", !codeOf(HOST_REWRITE).includes("studio-navigation"))

console.log("\n[J] auth · role · cookie 무변경")

const AUTH_FILES = [
  STUDIO_ACCESS_GUARD,
  "src/features/my/lib/require-parent-access.ts",
  "src/features/auth/lib/profile-sync.ts",
  "src/features/auth/lib/session.ts",
  "src/features/auth/lib/redirect.ts",
  "app/auth/callback/route.ts"
]
for (const file of AUTH_FILES) {
  check(`J) ${file} 가 그대로 있다`, exists(file))
  /*
   * S3F 이후 guard 는 목적지를 host 에 맞춰 고른다. 그래도 "누구인가" 는 여전히
   * profile 로 판단한다 — host 가 역할 판정에 끼어들지 않았는지만 본다.
   */
  check(`J) ${file} 가 host 로 권한을 판단하지 않는다`, !read(file).includes("isStudioHost") && !read(file).includes("isParentHost"))
}
check("J) studio guard 는 여전히 DB role 로 판단한다", read(STUDIO_ACCESS_GUARD).includes("normalizeProfileRole") && read(STUDIO_ACCESS_GUARD).includes('normalized.dbRole === "parent"'))
check("J) auth 계약 파일은 navigation helper 를 쓰지 않는다", ["src/features/auth/lib/profile-sync.ts", "src/features/auth/lib/session.ts", "src/features/auth/lib/redirect.ts", "app/auth/callback/route.ts"].every((file) => !read(file).includes("studio-navigation")))
check("J) resolvePostAuthRedirect 계약이 그대로다", codeOf("src/features/auth/lib/redirect.ts").includes('return "/studio"'))
check("J) navigation helper 는 role 을 보지 않는다", ["role", "profiles", "organization_id", "teachers", "session"].every((term) => !navigation.includes(term)))
for (const [label, code] of [
  [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)],
  [SUPABASE_SERVER, codeOf(SUPABASE_SERVER)],
  [MIDDLEWARE, middleware]
] as const) {
  check(`J) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
  check(`J) ${label} 이 navigation helper 를 쓰지 않는다`, !code.includes("studio-navigation"))
}
check("J) server client 는 여전히 cache() 다", codeOf(SUPABASE_SERVER).includes("export const getSupabaseServerClient = cache(async ()"))
check("J) middleware client 는 여전히 cookie 를 모으기만 한다", codeOf(SUPABASE_MIDDLEWARE).includes("pendingCookies.push(cookie)") && !codeOf(SUPABASE_MIDDLEWARE).includes("NextResponse."))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
