// Parent / Studio 검색 노출 경계 검증 (STUDIO SUBDOMAIN S4D).
//
//   npx tsx scripts/verify-studio-seo-boundary.ts
//
// 여기서 고정하는 것.
//   A. app/studio/layout.tsx 에 robots noindex
//   B. Studio 는 follow 도 하지 않는다
//   C. Studio metadata 가 Parent canonical 을 주장하지 않는다
//   D. Parent root metadata 는 noindex 가 아니다
//   E. Parent canonical · origin 계약 유지
//   F. sitemap 에 내부 /studio route 가 없다
//   G. Studio 의 clean SaaS route 도 Parent sitemap 에 없다
//   H. legacy /studio redirect 계약 유지
//   I. robots.ts 의 Parent 계약 보존
//   J. middleware 무변경
//   K. billing 무변경
//   L. auth · RLS 무변경
//
// Studio 는 로그인해야 쓰는 운영 도구다. 공개 문서가 아니다.
// robots.txt 로 크롤링을 막지 않고 meta 로 색인을 막는다 — 크롤러가 페이지를
// 읽을 수 있어야 noindex 를 볼 수 있기 때문이다.
//
// 소스 검사 + sitemap/robots 실제 호출만 쓴다. 네트워크·세션을 건드리지 않는다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { PARENT_ORIGIN, STUDIO_ORIGIN } from "@/shared/config/site-origins"
import { resolveStudioCanonicalRedirectUrl, resolveStudioRewritePathname } from "@/shared/config/studio-host-rewrite"
import robots from "../app/robots"

const ROOT_LAYOUT = "app/layout.tsx"
const STUDIO_LAYOUT = "app/studio/layout.tsx"
const ROBOTS = "app/robots.ts"
const SITEMAP = "app/sitemap.ts"
const MIDDLEWARE = "middleware.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const TOSS_CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"
const CALLBACK_URL_HELPER = "src/features/billing/lib/callback-url.ts"

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

const rootLayout = codeOf(ROOT_LAYOUT)
const studioLayout = codeOf(STUDIO_LAYOUT)
const sitemapSource = codeOf(SITEMAP)
const robotsSource = codeOf(ROBOTS)
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

console.log("[A-B] Studio 는 색인되지 않는다")

check("A) studio layout 에 metadata 가 있다", studioLayout.includes("export const metadata: Metadata"))
check("A) index: false", /robots:\s*\{[^}]*index:\s*false/.test(studioLayout))
check("B) follow: false", /robots:\s*\{[^}]*follow:\s*false/.test(studioLayout))
/* layout 이 Studio 트리 전체를 덮어야 한 화면만 새는 일이 없다. */
check("A) studio layout 이 트리 최상단이다", exists(STUDIO_LAYOUT))
const studioRoutes = walk("app/studio").filter((file) => /\/(page|route)\.tsx?$/.test(file))
check("A) Studio route 가 전부 이 layout 아래에 있다", studioRoutes.length >= 20 && studioRoutes.every((file) => file.startsWith("app/studio/")), `${studioRoutes.length}개`)
/* 개별 화면이 noindex 를 되돌리지 않는다. */
const studioOptOut = studioRoutes.filter((file) => /robots:\s*\{[^}]*index:\s*true/.test(codeOf(file)))
check("A) noindex 를 되돌린 Studio 화면이 없다", studioOptOut.length === 0, studioOptOut.join(", "))
/* Studio host 로 들어오는 clean 주소가 전부 이 트리로 간다. */
for (const external of ["/", "/applications", "/classes", "/schedule", "/teachers", "/settings", "/billing", "/auth/sign-in", "/auth/sign-up"]) {
  const internal = resolveStudioRewritePathname(STUDIO_HOST, external)
  check(`A) ${STUDIO_HOST}${external} → ${internal} (studio 트리)`, Boolean(internal?.startsWith("/studio")), String(internal))
}

console.log("\n[C] Studio 가 Parent 주소를 자기 것이라 주장하지 않는다")

check("C) studio layout 에 canonical 이 없다", !studioLayout.includes("canonical"))
check("C) studio layout 에 alternates 가 없다", !studioLayout.includes("alternates"))
check("C) metadataBase 가 Studio origin 이다", studioLayout.includes("metadataBase: new URL(STUDIO_ORIGIN)"))
check("C) Parent origin 을 쓰지 않는다", !studioLayout.includes("PARENT_ORIGIN") && !studioLayout.includes("toParentUrl"))
/* Studio 화면 어디에도 Parent canonical 이 없다. */
const studioCanonical = studioRoutes.filter((file) => codeOf(file).includes("canonical"))
check("C) Studio 화면에 canonical 선언이 없다", studioCanonical.length === 0, studioCanonical.join(", "))
/* 브랜드도 Parent 것을 그대로 쓰지 않는다. */
/* absolute 여야 root 의 "%s | 첫수업" template 이 덧씌워지지 않는다. */
check("C) Studio 제목이 root template 을 벗어난다", studioLayout.includes('absolute: "첫수업 파트너 센터"'))
check("C) Studio 제목에 default 를 쓰지 않는다", !/title:\s*\{[^}]*default:/.test(studioLayout))
check("C) Studio 제목 template 이 따로 있다", studioLayout.includes('template: "%s | 첫수업 파트너 센터"'))
check("C) Studio 설명이 따로 있다", studioLayout.includes("description:") && !studioLayout.includes("학부모와 학원을 연결하는"))

console.log("\n[D-E] Parent SEO 는 그대로다")

check("D) root layout 에 robots 설정이 없다", !rootLayout.includes("robots:"))
check("D) root layout 에 noindex 가 없다", !rootLayout.includes("noindex") && !/index:\s*false/.test(rootLayout))
check("E) metadataBase 가 Parent origin 이다", rootLayout.includes("metadataBase: new URL(PARENT_ORIGIN)"))
check("E) 기본 제목이 그대로다", rootLayout.includes('default: "첫수업"') && rootLayout.includes('template: "%s | 첫수업"'))
check("E) 기본 설명이 그대로다", rootLayout.includes("학부모와 학원을 연결하는 체험수업 예약 플랫폼"))

/* Parent 공개 화면의 canonical 선언이 하나도 사라지지 않았다. */
const PARENT_CANONICALS: Array<[string, string]> = [
  ["app/page.tsx", "/"],
  ["app/classes/page.tsx", "/classes"],
  ["app/my/applications/page.tsx", "/my/applications"],
  ["app/my/schedule/page.tsx", "/my/schedule"],
  ["app/notifications/page.tsx", "/notifications"]
]
for (const [file, canonical] of PARENT_CANONICALS) {
  check(`E) ${file} canonical ${canonical} 이 그대로다`, codeOf(file).includes(`canonical: "${canonical}"`))
  check(`E) ${file} 가 noindex 가 아니다`, !/index:\s*false/.test(codeOf(file)))
}
check("E) academy 상세의 canonical 이 그대로다", codeOf("app/academy/[handle]/page.tsx").includes("canonical: `/academy/${canonicalHandle}`"))
check("E) Home 의 openGraph 가 그대로다", codeOf("app/page.tsx").includes("openGraph:"))
check("E) partner metadata 가 그대로다", codeOf("app/partner/page.tsx").includes('title: "첫수업 파트너 - 체험수업 운영·전환 관리 SaaS"'))
/* Parent 화면 어디에도 이번 작업으로 noindex 가 들어가지 않았다. */
const parentPages = walk("app")
  .filter((file) => /\/(page|layout)\.tsx$/.test(file))
  .filter((file) => !file.startsWith("app/studio/"))
const parentNoindex = parentPages.filter((file) => /index:\s*false/.test(codeOf(file)))
check("D) Parent 화면에 noindex 가 들어가지 않았다", parentNoindex.length === 0, parentNoindex.join(", "))

console.log("\n[F-G] sitemap 은 Parent 공개 주소만 담는다")

check("F) sitemap 소스에 /studio 가 없다", !sitemapSource.includes("/studio"))
check("F) sitemap 은 Parent origin 으로만 만든다", sitemapSource.includes("toParentUrl(") && !sitemapSource.includes("toStudioUrl"))
/* Studio 의 clean 주소는 Parent 의 공개 주소와 글자가 같다. 실수로 들어가지 않았는지 본다. */
const SITEMAP_STATIC = ["/", "/academies", "/partner", "/privacy", "/terms", "/third-party-consent"]
for (const path of SITEMAP_STATIC) {
  check(`F) sitemap 에 ${path} 가 그대로 있다`, sitemapSource.includes(`path: "${path}"`))
}
const STUDIO_CLEAN_ONLY = ["/applications", "/schedule", "/teachers", "/settings", "/billing", "/cases", "/mypage", "/unregistered", "/access", "/pending"]
for (const path of STUDIO_CLEAN_ONLY) {
  check(`G) sitemap 에 Studio 전용 ${path} 가 없다`, !sitemapSource.includes(`path: "${path}"`))
}
/* /classes 는 Parent 목록이기도 하다 — 상세만 담고 목록 경로를 새로 넣지 않았다. */
check("G) sitemap 의 /classes 항목은 상세뿐이다", sitemapSource.includes("toParentUrl(`/classes/${classId}`)") && !sitemapSource.includes('path: "/classes"'))
check("G) sitemap 이 공개 수업만 담는다", sitemapSource.includes("item.isActive"))

console.log("\n[H] legacy /studio 는 여전히 Studio 로 넘어간다")

equals("H) firstsuup.com/studio → Studio", resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio"), `${STUDIO_ORIGIN}/`)
equals("H) firstsuup.com/studio/classes → Studio", resolveStudioCanonicalRedirectUrl(PARENT_HOST, "/studio/classes"), `${STUDIO_ORIGIN}/classes`)
check("H) canonical redirect 계약이 그대로다", middleware.includes("resolveStudioCanonicalRedirectUrl"))
check("H) 307 temporary 그대로", middleware.includes("const LEGACY_REDIRECT_STATUS = 307"))

console.log("\n[I] robots.txt 의 Parent 계약 보존")

const parentRobots = robots()
const rule = Array.isArray(parentRobots.rules) ? parentRobots.rules[0] : parentRobots.rules
equals("I) userAgent 가 그대로다", rule?.userAgent, "*")
equals("I) allow 가 그대로다", rule?.allow, "/")
equals("I) disallow 목록이 그대로다", JSON.stringify(rule?.disallow), JSON.stringify(["/auth/", "/studio/", "/admin/", "/my/"]))
equals("I) sitemap 주소가 그대로다", parentRobots.sitemap, `${PARENT_ORIGIN}/sitemap.xml`)
check("I) legacy /studio 차단이 남아 있다", (rule?.disallow as string[] | undefined)?.includes("/studio/") === true)
/* robots.txt 를 host 별로 나누지 않았다 — Parent 회귀 위험을 만들지 않는다. */
check("I) robots.ts 가 요청 host 를 읽지 않는다", !robotsSource.includes("headers()") && !robotsSource.includes("getRequestHostname"))
check("I) robots.ts 가 정적 함수 그대로다", robotsSource.includes("export default function robots(): MetadataRoute.Robots"))
/*
 * ⚠️ 그래서 Studio host 의 robots.txt 도 "Allow: /" 를 준다. 그게 맞다 —
 *    크롤러가 페이지를 읽을 수 있어야 meta 의 noindex 를 볼 수 있다.
 *    색인 차단의 authoritative contract 는 위의 layout metadata 다.
 */
check("I) Studio 색인 차단은 metadata 가 맡는다", /robots:\s*\{[^}]*index:\s*false/.test(studioLayout))

console.log("\n[shared auth] 공용 recovery 화면은 이번 범위 밖이다")

/* 같은 pathname 을 Parent 와 Studio 가 함께 쓴다. 전역 noindex 를 박으면 Parent 까지 바뀐다. */
const SHARED_AUTH_PAGES = [
  "app/auth/layout.tsx",
  "app/auth/find-email/page.tsx",
  "app/auth/reset-password/page.tsx",
  "app/auth/recovery/page.tsx",
  "app/auth/update-password/page.tsx"
]
for (const file of SHARED_AUTH_PAGES) {
  check(`shared) ${file} 가 그대로 있다`, exists(file))
  check(`shared) ${file} 에 전역 noindex 를 박지 않았다`, !/index:\s*false/.test(codeOf(file)))
}
/* 대신 robots.txt 의 /auth/ 차단이 그대로 남아 있다. */
check("shared) robots.txt 가 /auth/ 를 계속 막는다", (rule?.disallow as string[] | undefined)?.includes("/auth/") === true)
check("shared) 공용 auth 경로 passthrough 가 그대로다", codeOf("src/shared/config/studio-host-rewrite.ts").includes("isStudioSharedAuthPath"))

console.log("\n[J] middleware 무변경")

check("J) host rewrite 계약 그대로", middleware.includes("resolveStudioRewritePathname"))
check("J) response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("J) cookie 전파 계약 그대로", middleware.includes("takePendingCookies()") && middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))
check("J) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  middleware.slice(middleware.indexOf("matcher: [")).split("\n").some((row) => row.trim() === `"${source}",`)
))
check("J) middleware 가 metadata 를 다루지 않는다", !middleware.includes("robots") && !middleware.includes("metadata"))
for (const [label, code] of [[MIDDLEWARE, middleware], [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)]] as const) {
  check(`J) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
}

console.log("\n[K] billing 무변경")

const toss = codeOf(TOSS_CHECKOUT)
check('K) CALLBACK_PATH 가 "/studio/billing/callback" 이다', toss.includes('const CALLBACK_PATH = "/studio/billing/callback"'))
check('K) FAIL_PATH 가 "/studio/billing" 이다', toss.includes('const FAIL_PATH = "/studio/billing"'))
check("K) successUrl 은 요청 origin 으로 만들어진다", toss.includes("successUrl: toCallbackUrl(CALLBACK_PATH)"))
check("K) 실패 query 가 그대로다", toss.includes("?billing=failed"))
check("K) callback helper 가 그대로다", codeOf(CALLBACK_URL_HELPER).includes("getStudioNavigationPath"))
check("K) billing 이 metadata 를 다루지 않는다", !toss.includes("robots") && !toss.includes("metadata"))

console.log("\n[L] auth · RLS 무변경")

const AUTH_FILES = [
  "src/features/auth/lib/profile-sync.ts",
  "src/features/auth/lib/session.ts",
  "src/features/auth/lib/redirect.ts",
  "src/features/studio/lib/require-teacher-studio-access.ts",
  "src/features/my/lib/require-parent-access.ts",
  "app/auth/callback/route.ts"
]
for (const file of AUTH_FILES) {
  check(`L) ${file} 가 그대로 있다`, exists(file))
  check(`L) ${file} 가 metadata 를 다루지 않는다`, !read(file).includes("robots:") && !read(file).includes("metadataBase"))
}
check("L) studio guard 는 여전히 DB role 로 판단한다", (() => {
  const guard = read("src/features/studio/lib/require-teacher-studio-access.ts")
  return guard.includes("normalizeProfileRole") && guard.includes('normalized.dbRole === "parent"')
})())
check("L) studio layout 은 여전히 권한을 판단하지 않는다", !studioLayout.includes("requireTeacherStudioAccess") && !studioLayout.includes("supabase"))
check("L) studio layout 이 navigation provider 를 그대로 내려준다", studioLayout.includes("<StudioNavigationProvider hostname={await getRequestHostname()}>"))
check("L) DB 마이그레이션을 건드리지 않았다", walk("supabase/migrations").filter((file) => file.endsWith(".sql")).every((file) => !read(file).includes("noindex")))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
