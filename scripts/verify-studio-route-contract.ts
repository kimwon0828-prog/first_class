// Studio host routing contract 검증 (STUDIO SUBDOMAIN S3A).
//
//   npx tsx scripts/verify-studio-route-contract.ts
//
// 여기서 고정하는 것.
//   A. 실제 Studio internal route 가 전부 올바른 external path 로 변환된다.
//   B. external → internal 역변환이 맞다.
//   C. root: "/studio" ↔ "/" 이고, 중복 slash 를 만들지 않는다.
//   D. Parent route 코드가 바뀌지 않았다.
//   E. middleware 가 Parent 범위를 넓히지 않았다.
//   F. cookie 계약이 바뀌지 않았다.
//   G. revalidatePath("/studio/...") 가 그대로 남아 있다.
//   H. Toss billing callback 코드가 바뀌지 않았다.
//   I. S1 site origins 계약이 유지된다.
//   J. S2 auth entry separation 이 유지된다.
//
// contract 는 순수 함수다. S3B 에서 host rewrite 가 이 모듈을 쓰기 시작했고,
// 소비처는 studio-host-rewrite 한 곳으로만 둔다.
// 소스 검사와 순수 함수 호출만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import {
  PARENT_HOSTNAMES,
  PARENT_ORIGIN,
  STUDIO_HOSTNAMES,
  STUDIO_ORIGIN,
  isParentHost,
  isStudioHost
} from "@/shared/config/site-origins"
import {
  STUDIO_INTERNAL_PREFIX,
  isStudioInternalPath,
  toStudioExternalPath,
  toStudioInternalPath
} from "@/shared/config/studio-routes"

const MIDDLEWARE = "middleware.ts"
const SUPABASE_SERVER = "src/integrations/supabase/server.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const STUDIO_ROUTES = "src/shared/config/studio-routes.ts"
const HOST_REWRITE = "src/shared/config/studio-host-rewrite.ts"
const TOSS_CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"
const PARENT_SIGN_IN_PAGE = "app/auth/sign-in/page.tsx"
const STUDIO_SIGN_IN_FORM = "src/features/studio/ui/studio-sign-in-form.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}
const equals = (label: string, actual: unknown, expected: unknown) =>
  check(label, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)

/*
 * Route inventory 를 손으로 적지 않는다.
 *
 * ⚠️ app/studio 를 직접 훑어서 실제 존재하는 route 만 쓴다. 없는 route 를
 *    테스트에 넣으면 contract 가 현실과 어긋난 채로 초록불이 된다.
 */
const collectStudioRoutes = (dir: string, segments: string[] = []): string[] => {
  const entries = readdirSync(resolve(process.cwd(), dir), { withFileTypes: true })
  const routes: string[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      /* (dashboard) 같은 route group 은 URL 에 나타나지 않는다. */
      const isRouteGroup = entry.name.startsWith("(") && entry.name.endsWith(")")
      routes.push(...collectStudioRoutes(join(dir, entry.name), isRouteGroup ? segments : [...segments, entry.name]))
      continue
    }

    if (entry.name === "page.tsx" || entry.name === "route.ts") {
      routes.push(`/${["studio", ...segments].join("/")}`)
    }
  }

  return routes
}

const studioRoutes = Array.from(new Set(collectStudioRoutes("app/studio"))).sort()

console.log("[A] 실제 Studio internal route → external path")

/* 평범한 prefix 제거를 따르지 않는 화면만 여기에 적는다. */
const SPECIAL_EXTERNAL: Record<string, string> = {
  "/studio": "/",
  "/studio/sign-in": "/auth/sign-in",
  "/studio/sign-up": "/auth/sign-up",
  "/studio/sign-out": "/auth/sign-out"
}

check("A) Studio route 를 실제로 찾아냈다", studioRoutes.length >= 20, `${studioRoutes.length}개`)
for (const internal of studioRoutes) {
  const expected = SPECIAL_EXTERNAL[internal] ?? internal.slice(STUDIO_INTERNAL_PREFIX.length)
  equals(`A) ${internal} → ${expected}`, toStudioExternalPath(internal), expected)
}

/* 지시서가 이름으로 짚은 route 가 실제로 존재하는지도 같이 본다. */
const NAMED_ROUTES = [
  "/studio",
  "/studio/applications",
  "/studio/classes",
  "/studio/classes/new",
  "/studio/teachers",
  "/studio/schedule",
  "/studio/cases",
  "/studio/cases/import",
  "/studio/billing",
  "/studio/billing/callback",
  "/studio/mypage",
  "/studio/mypage/profile",
  "/studio/settings",
  "/studio/unregistered",
  "/studio/access",
  "/studio/pending",
  "/studio/sign-in",
  "/studio/sign-up",
  "/studio/sign-out"
]
for (const route of NAMED_ROUTES) {
  check(`A) ${route} 가 실제 route 다`, studioRoutes.includes(route))
}

/* dynamic segment 는 파일 이름이 아니라 실제 값으로 지나간다. */
const DYNAMIC_CASES: Array<[string, string]> = [
  ["/studio/applications/abc", "/applications/abc"],
  ["/studio/classes/abc/edit", "/classes/abc/edit"],
  ["/studio/cases/import/template", "/cases/import/template"]
]
for (const [internal, external] of DYNAMIC_CASES) {
  equals(`A) ${internal} → ${external}`, toStudioExternalPath(internal), external)
}

console.log("\n[B] external → internal 역변환")

for (const internal of [...studioRoutes, ...DYNAMIC_CASES.map(([path]) => path)]) {
  const external = toStudioExternalPath(internal)
  equals(`B) ${external} → ${internal}`, toStudioInternalPath(external), internal)
}

console.log("\n[B] round-trip: internal → external → internal")

for (const internal of [...studioRoutes, ...DYNAMIC_CASES.map(([path]) => path)]) {
  equals(`B) round-trip ${internal}`, toStudioInternalPath(toStudioExternalPath(internal)), internal)
}

console.log("\n[C] root · 중복 slash · 입력 검증")

equals('C) toStudioExternalPath("/studio") === "/"', toStudioExternalPath("/studio"), "/")
equals('C) toStudioInternalPath("/") === "/studio"', toStudioInternalPath("/"), STUDIO_INTERNAL_PREFIX)
equals('C) root round-trip', toStudioExternalPath(toStudioInternalPath("/")), "/")
/* trailing slash 는 거절하지 않고 같은 자리로 읽는다. */
equals('C) toStudioExternalPath("/studio/") === "/"', toStudioExternalPath("/studio/"), "/")
equals('C) toStudioInternalPath("/applications/")', toStudioInternalPath("/applications/"), "/studio/applications")

/* 어떤 입력으로도 // 를 만들지 않는다. */
const allOutputs = [
  ...studioRoutes.map((path) => toStudioExternalPath(path)),
  ...studioRoutes.map((path) => toStudioInternalPath(toStudioExternalPath(path))),
  ...DYNAMIC_CASES.flatMap(([internal]) => [toStudioExternalPath(internal), internal])
]
check("C) 어떤 결과에도 중복 slash 가 없다", allOutputs.every((path) => !path.includes("//")))
check("C) 모든 결과가 / 로 시작한다", allOutputs.every((path) => path.startsWith("/")))

for (const bad of ["/studio//applications", "studio", "", "//evil.com", "/studio/a b", "/studio\\a", "https://example.com"]) {
  check(`C) toStudioExternalPath(${JSON.stringify(bad)}) 는 거절한다`, (() => {
    try {
      toStudioExternalPath(bad)
      return false
    } catch {
      return true
    }
  })())
}
for (const bad of ["//evil.com", "/a//b", "classes", "/a b"]) {
  check(`C) toStudioInternalPath(${JSON.stringify(bad)}) 는 거절한다`, (() => {
    try {
      toStudioInternalPath(bad)
      return false
    } catch {
      return true
    }
  })())
}
/* pathname 전용이다. query/hash 를 삼켜서 잃어버리지 않는다. */
for (const withQuery of ["/studio/access?reason=missing_org", "/studio/access#top"]) {
  check(`C) ${withQuery} 는 pathname 이 아니므로 거절한다`, (() => {
    try {
      toStudioExternalPath(withQuery)
      return false
    } catch {
      return true
    }
  })())
}
check("C) Studio 밖의 경로는 external 변환을 거절한다", (() => {
  try {
    toStudioExternalPath("/classes")
    return false
  } catch {
    return true
  }
})())

console.log("\n[C] isStudioInternalPath")

for (const path of ["/studio", "/studio/applications", "/studio/classes/abc/edit"]) {
  check(`C) isStudioInternalPath(${path}) === true`, isStudioInternalPath(path))
}
for (const path of ["/", "/classes", "/studiolike", "/my/studio", "/auth/sign-in"]) {
  check(`C) isStudioInternalPath(${path}) === false`, !isStudioInternalPath(path))
}

console.log("\n[C] host 판별은 순수 판별만 한다")

for (const host of [...STUDIO_HOSTNAMES, "STUDIO.FIRSTSUUP.COM", "studio.firstsuup.com:443", "studio.firstsuup.com."]) {
  check(`C) isStudioHost(${host}) === true`, isStudioHost(host))
  check(`C) isParentHost(${host}) === false`, !isParentHost(host))
}
for (const host of [...PARENT_HOSTNAMES]) {
  check(`C) isParentHost(${host}) === true`, isParentHost(host))
  check(`C) isStudioHost(${host}) === false`, !isStudioHost(host))
}
check("C) PARENT_HOSTNAMES 가 origin 에서 나온다", PARENT_HOSTNAMES.includes(new URL(PARENT_ORIGIN).hostname))
check("C) STUDIO_HOSTNAMES 가 origin 에서 나온다", STUDIO_HOSTNAMES.includes(new URL(STUDIO_ORIGIN).hostname))
/* 개발 host 는 아직 계약이 아니다. 여기서 고정하지 않는다. */
for (const host of ["localhost", "studio.localhost", "localhost:3000", "evil.com", "studio.firstsuup.com.evil.com", ""]) {
  check(`C) ${JSON.stringify(host)} 는 Studio host 가 아니다`, !isStudioHost(host))
  check(`C) ${JSON.stringify(host)} 는 Parent host 가 아니다`, !isParentHost(host))
}

console.log("\n[소비처] contract 를 쓰는 곳은 한 곳뿐이다")

/*
 * S3A 때는 아무도 이 모듈을 부르지 않았다. S3B 에서 host rewrite 가 붙으면서
 * 소비처가 생겼다.
 *
 * ⚠️ 소비처를 studio-host-rewrite 하나로 묶어 둔다. 여기저기서 직접 부르기
 *    시작하면 경로 규칙이 다시 흩어진다.
 */
const walk = (path: string): string[] => {
  const full = resolve(process.cwd(), path)
  if (!existsSync(full)) return []
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
  )
}
const sourceFiles = ["app", "src"].flatMap(walk).concat("middleware.ts").filter((file) => /\.(ts|tsx)$/.test(file))
const callers = sourceFiles.filter(
  (file) => file !== STUDIO_ROUTES && /from "(@\/shared\/config\/studio-routes|\.\/studio-routes)"/.test(read(file))
)

check("소비처) studio-routes 를 부르는 곳은 studio-host-rewrite 뿐이다", callers.length === 1 && callers[0] === HOST_REWRITE, callers.join(", "))
check("소비처) middleware 는 contract 를 직접 부르지 않는다", !read(MIDDLEWARE).includes("studio-routes"))
check("소비처) studio-routes 는 rewrite/redirect 를 하지 않는다", (() => {
  const code = codeOf(STUDIO_ROUTES)
  return !code.includes("NextResponse") && !code.includes("redirect") && !code.includes("rewrite")
})())
check("소비처) studio-routes 는 순수 모듈이다", (() => {
  const code = codeOf(STUDIO_ROUTES)
  return !code.includes("process.env") && !/from "next/.test(code) && !code.includes("server-only")
})())
check("소비처) studio-host-rewrite 도 순수 모듈이다", (() => {
  const code = codeOf(HOST_REWRITE)
  return !code.includes("process.env") && !/from "next/.test(code) && !code.includes("server-only")
})())

console.log("\n[D] Parent route 코드 무변경")

const PARENT_ROUTES = [
  "app/page.tsx",
  "app/classes/page.tsx",
  "app/classes/[id]/page.tsx",
  "app/academies/page.tsx",
  "app/favorites/page.tsx",
  "app/my/page.tsx"
]
for (const route of PARENT_ROUTES) {
  check(`D) ${route} 가 그대로 있다`, exists(route))
  check(`D) ${route} 가 studio-routes 를 쓰지 않는다`, !read(route).includes("studio-routes"))
}
check("D) Parent /classes route 는 Studio 로 넘어가지 않았다", !exists("app/studio/(dashboard)/classes/[id]/page.tsx"))

console.log("\n[E] middleware 는 Parent 범위를 넓히지 않는다")

const middleware = codeOf(MIDDLEWARE)
/* S3B: middleware 는 이제 Studio host 를 rewrite 한다. rewrite 계약 자체는
   verify-studio-host-rewrite 가 본다. 여기서는 Parent 범위가 넓어지지 않았는지만 본다. */
const parentMatcherIsIntact = (code: string) => {
  const block = code.slice(code.indexOf("matcher: ["))
  return (
    ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
      block.split("\n").some((row) => row.trim() === `"${source}",`)
    ) &&
    !block.includes('"/:path*"') &&
    !block.includes('"/(.*)"')
  )
}
check("E) Parent matcher 범위가 그대로다", parentMatcherIsIntact(middleware))
check("E) 세션 갱신만 한다", middleware.includes("await supabase.auth.getClaims()"))
for (const term of ["NextResponse.redirect", "nextUrl.host"]) {
  check(`E) middleware 에 ${term} 가 없다`, !middleware.includes(term))
}
/* 경로 규칙은 S3A contract 한 곳에만 있다. middleware 본문에 다시 적지 않는다. */
check(
  "E) middleware 본문에 /studio 경로를 하드코딩하지 않았다",
  !/"\/studio\//.test(middleware.slice(0, middleware.indexOf("matcher: [")))
)

console.log("\n[F] cookie 계약 무변경")

for (const [label, code] of [
  [SUPABASE_SERVER, codeOf(SUPABASE_SERVER)],
  [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)]
] as const) {
  check(`F) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
  check(`F) ${label} 이 sameSite 를 새로 지정하지 않는다`, !/\bsameSite\s*:/.test(code))
  check(`F) ${label} 이 studio-routes 를 쓰지 않는다`, !code.includes("studio-routes"))
}
check("F) 서버 client 가 cookie options 를 그대로 넘긴다", codeOf(SUPABASE_SERVER).includes("cookie.options"))
/* S3B: middleware client 는 cookie 를 객체째 모아 두고, middleware 가 options 채로 적는다. */
check("F) middleware client 가 cookie 를 객체째 모아 둔다", codeOf(SUPABASE_MIDDLEWARE).includes("pendingCookies.push(cookie)"))
check("F) 모은 cookie 가 options 채로 적힌다", middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))

console.log("\n[G] revalidatePath(\"/studio/...\") 유지")

const revalidateTargets = Array.from(
  new Set(
    (() => {
      const walk = (path: string): string[] => {
        const entries = readdirSync(resolve(process.cwd(), path), { withFileTypes: true })
        return entries.flatMap((entry) =>
          entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]
        )
      }
      return walk("src/features/studio").filter((file) => /\.ts$/.test(file))
    })().flatMap((file) =>
      Array.from(read(file).matchAll(/revalidatePath\("(\/studio[^"]*)"\)/g)).map((match) => match[1])
    )
  )
).sort()

check("G) Studio revalidatePath 대상이 남아 있다", revalidateTargets.length > 0, revalidateTargets.join(", "))
/* 내부 경로 그대로여야 한다 — external path 로 바꾸면 캐시가 엉뚱한 자리를 턴다. */
check("G) 전부 /studio 내부 경로다", revalidateTargets.every((target) => isStudioInternalPath(target)))
for (const target of ["/studio", "/studio/schedule", "/studio/classes", "/studio/teachers"]) {
  check(`G) ${target} revalidate 가 남아 있다`, revalidateTargets.includes(target))
}

console.log("\n[H] Toss billing callback 무변경")

const tossCheckout = codeOf(TOSS_CHECKOUT)
check('H) CALLBACK_PATH 가 "/studio/billing/callback" 이다', tossCheckout.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
check("H) successUrl 은 origin + CALLBACK_PATH 다", tossCheckout.includes("successUrl: `${origin}${CALLBACK_PATH}`"))
check("H) Toss checkout 이 studio-routes 를 쓰지 않는다", !tossCheckout.includes("studio-routes"))
check("H) callback route 가 그대로 있다", exists("app/studio/(dashboard)/billing/callback/page.tsx"))

console.log("\n[I] S1 site origins 계약 유지")

equals("I) PARENT_ORIGIN", PARENT_ORIGIN, "https://firstsuup.com")
equals("I) STUDIO_ORIGIN", STUDIO_ORIGIN, "https://studio.firstsuup.com")
check("I) site-origins 는 환경변수를 읽지 않는다", !codeOf("src/shared/config/site-origins.ts").includes("process.env"))
check("I) site-origins 는 요청 host 를 추론하지 않는다", !codeOf("src/shared/config/site-origins.ts").includes("headers()"))

console.log("\n[J] S2 auth entry separation 유지")

check("J) Parent sign-in 에 /studio 가 없다", !codeOf(PARENT_SIGN_IN_PAGE).includes("/studio"))
check("J) Studio sign-in form 에 Parent 로그인 CTA 가 없다", !codeOf(STUDIO_SIGN_IN_FORM).includes("학부모 로그인"))
check("J) Studio sign-in route 가 그대로 있다", exists("app/studio/sign-in/page.tsx"))
/* S3A 는 internal href 를 옮기지 않는다. */
check("J) Studio 내부 href 가 그대로 /studio/sign-up 이다", codeOf(STUDIO_SIGN_IN_FORM).includes('href="/studio/sign-up"'))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
