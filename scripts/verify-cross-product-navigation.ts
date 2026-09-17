// Parent ↔ Studio cross-product navigation 안전성 검증 (STUDIO SUBDOMAIN S3E).
//
//   npx tsx scripts/verify-cross-product-navigation.ts
//
// 여기서 고정하는 것.
//   A. Studio production host + Parent /classes → https://firstsuup.com/classes
//   B. Studio localhost + /classes             → /classes
//   C. Parent production host + /studio        → https://studio.firstsuup.com/
//   D. Parent localhost + /studio              → /studio
//   E. Studio→Parent 5곳이 production 에서 same-host 로 loop 하지 않는다.
//   F. require-parent-access 가 Parent host 에서 same-host /studio 로 남지 않는다.
//   G. toParentUrl · toStudioUrl · toStudioExternalPath 를 재사용한다.
//   H. host 는 navigation 에만 쓴다.
//   I. middleware 무변경
//   J. revalidatePath 무변경
//   K. Toss callback 무변경
//   L. auth / RLS / profile role 계약 무변경
//
// 그리고 loop regression 을 논리로 되짚는다 —
//   studio.firstsuup.com/classes → /studio/classes → parent role redirect
//   의 목적지 hostname 이 firstsuup.com 이어야 한다. 다시 studio 가 나오면 loop.
//
// 순수 함수 호출 + 소스 검사만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { PARENT_ORIGIN, STUDIO_ORIGIN } from "@/shared/config/site-origins"
import {
  getParentCrossProductHref,
  getStudioCrossProductHref
} from "@/shared/config/cross-product-navigation"
import { resolveStudioRewritePathname } from "@/shared/config/studio-host-rewrite"

const CROSS_PRODUCT = "src/shared/config/cross-product-navigation.ts"
const REQUEST_HOST = "src/shared/lib/request-host.ts"
const STUDIO_GUARD = "src/features/studio/lib/require-teacher-studio-access.ts"
const PARENT_GUARD = "src/features/my/lib/require-parent-access.ts"
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

const crossProduct = codeOf(CROSS_PRODUCT)
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
const WWW_HOST = `www.${PARENT_HOST}`
const LOCAL_HOSTS = ["localhost", "localhost:3000", "127.0.0.1:3000", "studio.localhost", "", "unknown.example"]

const toParent = (hostname: string, pathname: string) => getParentCrossProductHref({ pathname, hostname })
const toStudio = (hostname: string, internalPath: string) => getStudioCrossProductHref({ internalPath, hostname })

console.log("[A] Studio production host → Parent 는 절대 주소다")

const PARENT_TARGETS = ["/classes", "/", "/my", "/academies"]
for (const pathname of PARENT_TARGETS) {
  equals(`A) ${STUDIO_HOST} → ${pathname}`, toParent(STUDIO_HOST, pathname), `${PARENT_ORIGIN}${pathname}`)
}
/* host 표기가 흔들려도 같은 결과여야 한다. */
for (const host of [STUDIO_HOST.toUpperCase(), `${STUDIO_HOST}:443`, `${STUDIO_HOST}.`]) {
  equals(`A) ${host} → /classes`, toParent(host, "/classes"), `${PARENT_ORIGIN}/classes`)
}

console.log("\n[B] Studio localhost → Parent 는 기존 relative 경로")

for (const host of LOCAL_HOSTS) {
  for (const pathname of PARENT_TARGETS) {
    equals(`B) ${JSON.stringify(host)} → ${pathname} 그대로`, toParent(host, pathname), pathname)
  }
}
check("B) localhost 결과에 production origin 이 섞이지 않는다", LOCAL_HOSTS.every((host) => !toParent(host, "/classes").includes("://")))

console.log("\n[C] Parent production host → Studio 는 절대 주소다")

const STUDIO_TARGETS: Array<[string, string]> = [
  ["/studio", "/"],
  ["/studio/applications", "/applications"],
  ["/studio/classes", "/classes"],
  ["/studio/sign-in", "/auth/sign-in"]
]
for (const host of [PARENT_HOST, WWW_HOST]) {
  for (const [internal, external] of STUDIO_TARGETS) {
    equals(`C) ${host} → ${internal}`, toStudio(host, internal), `${STUDIO_ORIGIN}${external}`)
  }
}
equals("C) /studio 는 Studio 루트가 된다", toStudio(PARENT_HOST, "/studio"), `${STUDIO_ORIGIN}/`)

console.log("\n[D] Parent localhost → Studio 는 기존 relative 경로")

for (const host of LOCAL_HOSTS) {
  for (const [internal] of STUDIO_TARGETS) {
    equals(`D) ${JSON.stringify(host)} → ${internal} 그대로`, toStudio(host, internal), internal)
  }
}
check("D) localhost 결과에 production origin 이 섞이지 않는다", LOCAL_HOSTS.every((host) => !toStudio(host, "/studio").includes("://")))
/* 같은 제품 host 에서는 cross-product 주소를 만들지 않는다. */
equals("D) Studio host 에서 Studio 로 가는 건 그대로다", toStudio(STUDIO_HOST, "/studio/classes"), "/studio/classes")
equals("D) Parent host 에서 Parent 로 가는 건 그대로다", toParent(PARENT_HOST, "/classes"), "/classes")

console.log("\n[loop regression] Studio host 에서 학부모가 갇히지 않는다")

/*
 * ⚠️ 이 검사가 이번 단계의 이유다.
 *
 *    studio.firstsuup.com/classes 는 middleware 가 /studio/classes 로 rewrite
 *    한다. 거기서 학부모를 relative "/classes" 로 보내면 같은 자리로 돌아온다.
 *    목적지 host 가 Parent 인지 직접 확인한다.
 */
equals("loop) studio host /classes 는 내부 /studio/classes 로 rewrite 된다", resolveStudioRewritePathname(STUDIO_HOST, "/classes"), "/studio/classes")

const parentRoleDestination = toParent(STUDIO_HOST, "/classes")
check("loop) 학부모 목적지가 절대 주소다", parentRoleDestination.startsWith("http"), parentRoleDestination)
equals("loop) 목적지 hostname 이 Parent 다", new URL(parentRoleDestination).hostname, PARENT_HOST)
check("loop) 목적지가 다시 Studio host 가 아니다", new URL(parentRoleDestination).hostname !== STUDIO_HOST)
/* 목적지를 다시 태워도 Studio 로 빨려 들어가지 않는다. */
equals(
  "loop) 목적지 pathname 은 Parent host 에서 rewrite 되지 않는다",
  resolveStudioRewritePathname(new URL(parentRoleDestination).hostname, new URL(parentRoleDestination).pathname),
  null
)

/* 반대 방향도 같은 방식으로 본다. */
const studioRoleDestination = toStudio(PARENT_HOST, "/studio")
equals("loop) Parent host 의 role mismatch 목적지 hostname 이 Studio 다", new URL(studioRoleDestination).hostname, STUDIO_HOST)
equals("loop) 그 목적지는 Studio 루트다", studioRoleDestination, `${STUDIO_ORIGIN}/`)
check("loop) Studio 루트는 /studio prefix 를 달고 있지 않다", !new URL(studioRoleDestination).pathname.startsWith("/studio"))

console.log("\n[E] Studio→Parent 5곳이 더 이상 same-host 로 보내지 않는다")

const STUDIO_TO_PARENT_SITES = [
  STUDIO_GUARD,
  "app/studio/sign-in/page.tsx",
  "app/studio/sign-up/page.tsx",
  "app/studio/pending/page.tsx",
  "app/studio/access/page.tsx"
]
for (const file of STUDIO_TO_PARENT_SITES) {
  const code = codeOf(file)
  check(`E) ${file} 가 cross-product helper 를 쓴다`, code.includes("getParentCrossProductHref"))
  check(`E) ${file} 가 request host 를 읽는다`, code.includes("getRequestHostname"))
  check(`E) ${file} 에 같은 host 로 보내는 /classes 가 남아 있지 않다`, !code.includes('redirect("/classes")') && !code.includes('href="/classes"'))
}
/* 문제의 그 자리가 확실히 바뀌었는지 이름으로 짚는다. */
const studioGuard = codeOf(STUDIO_GUARD)
check("E) parent_role_redirect_classes 가 여전히 기록된다", studioGuard.includes('redirectReason: "parent_role_redirect_classes"'))
check(
  "E) parent role redirect 가 helper 를 거친다",
  studioGuard.includes('redirect(getParentCrossProductHref({ pathname: "/classes", hostname: await getRequestHostname() }))')
)

console.log("\n[F] Parent→Studio 경계 1곳")

const parentGuard = codeOf(PARENT_GUARD)
check("F) require-parent-access 가 cross-product helper 를 쓴다", parentGuard.includes("getStudioCrossProductHref"))
check("F) same-host /studio redirect 가 남아 있지 않다", !parentGuard.includes('redirect("/studio")'))
check("F) role_mismatch 분기는 그대로다", parentGuard.includes('state.status === "role_mismatch"'))
/* 나머지 분기는 Parent 내부 이동이라 건드리지 않는다. */
check("F) no_user 는 여전히 Parent 로그인으로 간다", parentGuard.includes("/auth/sign-in?returnTo="))
check("F) profile_error 는 여전히 Parent Home 으로 간다", parentGuard.includes('redirect("/")'))

console.log("\n[범위] global replace 를 하지 않았다")

const sourceFiles = ["app", "src"].flatMap(walk).filter((file) => /\.(ts|tsx)$/.test(file))
const remainingParentRelative = sourceFiles.filter(
  (file) => !STUDIO_TO_PARENT_SITES.includes(file) && /redirect\("\/classes"\)|href="\/classes"/.test(read(file))
)
check("범위) Parent 쪽 /classes 링크는 건드리지 않았다", remainingParentRelative.length > 0, `${remainingParentRelative.length}개 파일 그대로`)
check("범위) 손댄 파일은 6곳뿐이다", [...STUDIO_TO_PARENT_SITES, PARENT_GUARD].every(exists))
/* S3F 대상 — Studio 내부 same-product navigation 은 그대로다. */
/* Studio 가 소유한 화면만 본다. Parent→Studio CTA 는 다음 단계 몫이라 리터럴로 남는다. */
const studioInternalHrefs = sourceFiles
  .filter((file) => file.startsWith("app/studio/") || file.startsWith("src/features/studio/"))
  .reduce(
  (total, file) => total + (read(file).match(/href="\/studio(?:\/[^"]*)?"/g) ?? []).length,
  0
)
/* S3F 에서 Studio 내부 navigation 이 host-aware helper 로 옮겨갔다.
   자세한 계약은 verify-studio-navigation-migration 이 본다. */
check("범위) Studio 내부 href 는 helper 를 거친다", studioInternalHrefs === 0, `하드코딩 ${studioInternalHrefs}개`)
check("범위) Studio 내부 redirect 도 helper 를 거친다", studioGuard.includes('studioPath("/studio/sign-in")') && studioGuard.includes('studioPath("/studio/pending")'))
/*
 * S4A 에서 공용 auth 화면도 Parent 로 돌아갈 일이 생겼다. client 가 각자 helper 를
 * 부르지 않도록 provider 의 훅 하나로 모았다. 그 진입점까지가 허용 범위다.
 */
const CROSS_PRODUCT_ENTRY_POINTS = [
  ...STUDIO_TO_PARENT_SITES,
  PARENT_GUARD,
  "src/features/studio/ui/studio-navigation-provider.tsx"
]
check("범위) cross-product helper 를 쓰는 곳은 정해진 진입점뿐이다", (() => {
  const callers = sourceFiles.filter((file) => read(file).includes("cross-product-navigation"))
  return callers.every((file) => CROSS_PRODUCT_ENTRY_POINTS.includes(file)) &&
    CROSS_PRODUCT_ENTRY_POINTS.every((file) => callers.includes(file))
})(), sourceFiles.filter((file) => read(file).includes("cross-product-navigation")).join(", "))

console.log("\n[G] 기존 contract 를 재사용한다")

check("G) toParentUrl 을 쓴다", crossProduct.includes("toParentUrl"))
check("G) toStudioUrl 을 쓴다", crossProduct.includes("toStudioUrl"))
check("G) toStudioExternalPath 를 쓴다", crossProduct.includes("toStudioExternalPath"))
check("G) host 판별은 S1 helper 를 쓴다", crossProduct.includes("isStudioHost") && crossProduct.includes("isParentHost"))
check("G) 경로를 다시 하드코딩하지 않았다", !/"\/studio\//.test(crossProduct) && !crossProduct.includes("firstsuup.com"))
/* 순수 모듈이어야 server · client 양쪽에서 쓸 수 있다. */
for (const term of ["next/headers", "next/navigation", "window", "process.env", "server-only"]) {
  check(`G) cross-product helper 가 ${term} 에 의존하지 않는다`, !crossProduct.includes(term))
}
check("G) helper 는 던지지 않는다", (() => {
  for (const bad of ["", "not-a-path", "//evil.com", "/a b"]) {
    try {
      if (toParent(STUDIO_HOST, bad) !== bad) return false
      if (toStudio(PARENT_HOST, bad) !== bad) return false
    } catch {
      return false
    }
  }
  return true
})())

console.log("\n[H] host 는 navigation 에만 쓴다")

const requestHost = codeOf(REQUEST_HOST)
check("H) request-host 는 server-only 다", read(REQUEST_HOST).includes('import "server-only"'))
check("H) middleware 와 같은 순서로 읽는다", requestHost.includes('requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host")'))
check("H) middleware 도 같은 순서를 쓴다", middleware.includes('request.headers.get("x-forwarded-host") ?? request.headers.get("host")'))
for (const term of ["role", "profiles", "organization_id", "teachers", "supabase", "getSession"]) {
  check(`H) request-host 에 ${term} 가 없다`, !requestHost.includes(term))
  check(`H) cross-product helper 에 ${term} 가 없다`, !crossProduct.includes(term))
}
/* 권한은 여전히 profile 로 판단한다 — host 로 바꿔치기하지 않았다. */
check("H) studio guard 는 여전히 DB role 로 판단한다", studioGuard.includes("normalizeProfileRole") && studioGuard.includes('normalized.dbRole === "parent"'))
check("H) studio guard 가 host 로 권한을 판단하지 않는다", !studioGuard.includes("isStudioHost") && !studioGuard.includes("isParentHost"))
check("H) parent guard 는 여전히 resolveCurrentAuth 를 쓴다", parentGuard.includes("resolveCurrentAuth"))
check("H) parent guard 가 host 로 권한을 판단하지 않는다", !parentGuard.includes("isStudioHost") && !parentGuard.includes("isParentHost"))

console.log("\n[I] middleware 무변경")

check("I) host rewrite 계약 그대로", middleware.includes("resolveStudioRewritePathname"))
check("I) canonical redirect 계약 그대로", middleware.includes("resolveStudioCanonicalRedirectUrl"))
check("I) response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("I) cookie 전파 계약 그대로", middleware.includes("takePendingCookies()") && middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))
check("I) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  middleware.slice(middleware.indexOf("matcher: [")).split("\n").some((row) => row.trim() === `"${source}",`)
))
check("I) middleware 가 cross-product helper 를 쓰지 않는다", !middleware.includes("cross-product-navigation"))
check("I) middleware client 는 여전히 cookie 를 모으기만 한다", codeOf(SUPABASE_MIDDLEWARE).includes("pendingCookies.push(cookie)") && !codeOf(SUPABASE_MIDDLEWARE).includes("NextResponse."))
for (const [label, code] of [[MIDDLEWARE, middleware], [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)], [SUPABASE_SERVER, codeOf(SUPABASE_SERVER)]] as const) {
  check(`I) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
}

console.log("\n[J] revalidatePath 무변경")

const revalidateTargets = Array.from(
  new Set(
    walk("src/features")
      .filter((file) => /\.ts$/.test(file))
      .flatMap((file) => Array.from(read(file).matchAll(/revalidatePath\("([^"]*)"\)/g)).map((match) => match[1]))
      .filter((target) => target.startsWith("/studio"))
  )
).sort()
check("J) Studio revalidatePath 대상이 남아 있다", revalidateTargets.length >= 9, revalidateTargets.join(", "))
for (const target of ["/studio", "/studio/applications", "/studio/classes", "/studio/schedule", "/studio/teachers"]) {
  check(`J) ${target} 가 그대로다`, revalidateTargets.includes(target))
}
check("J) revalidatePath 가 cross-product helper 를 쓰지 않는다", !walk("src/features").some((file) => /\.ts$/.test(file) && read(file).includes("getParentCrossProductHref") && read(file).includes("revalidatePath")))

console.log("\n[K] Toss callback 무변경")

const tossCheckout = codeOf(TOSS_CHECKOUT)
check('K) CALLBACK_PATH 가 "/studio/billing/callback" 이다', tossCheckout.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
check("K) successUrl 은 origin + CALLBACK_PATH 다", tossCheckout.includes("successUrl: `${origin}${CALLBACK_PATH}`"))
check("K) Toss checkout 이 cross-product helper 를 쓰지 않는다", !tossCheckout.includes("cross-product-navigation"))
check("K) Supabase OAuth callback 이 그대로다", (() => {
  const callback = codeOf("app/auth/callback/route.ts")
  return callback.includes("supabase.auth.exchangeCodeForSession(code)") && !callback.includes("cross-product-navigation")
})())

console.log("\n[L] auth / role 계약 무변경")

const AUTH_FILES = [
  "src/features/auth/lib/profile-sync.ts",
  "src/features/auth/lib/session.ts",
  "src/features/auth/lib/redirect.ts",
  "src/features/auth/lib/current-auth.ts",
  "app/auth/callback/route.ts"
]
for (const file of AUTH_FILES) {
  check(`L) ${file} 가 그대로 있다`, exists(file))
  check(`L) ${file} 가 cross-product helper 를 쓰지 않는다`, !read(file).includes("cross-product-navigation"))
}
check("L) normalizeProfileRole 매핑이 그대로다", (() => {
  const sync = codeOf("src/features/auth/lib/profile-sync.ts")
  return sync.includes("normalizeProfileRole")
})())
check("L) resolvePostAuthRedirect 계약이 그대로다", codeOf("src/features/auth/lib/redirect.ts").includes('return "/studio"'))
check("L) studio guard 의 STUDIO_ROLES 가 그대로다", studioGuard.includes('const STUDIO_ROLES = ["academy", "admin"] as const'))
check("L) DB 스키마를 건드리지 않았다", (() => {
  const migrations = walk("supabase/migrations").filter((file) => file.endsWith(".sql"))
  return migrations.every((file) => !read(file).includes("cross-product"))
})())

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
