// Toss 결제 복귀 주소의 Studio host 호환 검증 (STUDIO SUBDOMAIN S4C).
//
//   npx tsx scripts/verify-studio-billing-callback-routing.ts
//
// 여기서 고정하는 것.
//   A. 내부 route 는 여전히 /studio/billing/callback
//   B. production Studio successUrl → https://studio.firstsuup.com/billing/callback
//   C. production Studio failUrl    → clean Studio 주소 + 기존 failure query
//   D. studio.firstsuup.com/studio/billing/callback 을 새로 만들지 않는다
//   E. localhost → http://localhost:<port>/studio/billing/callback
//   F. localhost 에서 production domain 으로 튀지 않는다
//   G. clean /billing/callback → 내부 /studio/billing/callback 으로 rewrite
//   H. 옛 /studio/billing/callback 은 canonical redirect 로 계속 받아 준다
//   I. 금액 · 주문 · paymentKey 처리 무변경
//   J. Toss 키 · 환경변수 계약 무변경
//   K. middleware cookie 계약 무변경
//   L. S4B cross-product 계약 무변경
//
// 이번 단계는 결제 재설계가 아니다. URL 경계만 옮긴다.
// 실제 결제 · 승인 API 호출 · production write 를 하지 않는다.
// 순수 함수 호출 + 소스 검사만 쓴다.

import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { resolveStudioBillingCallbackUrl } from "@/features/billing/lib/callback-url"
import { PARENT_ORIGIN, STUDIO_ORIGIN } from "@/shared/config/site-origins"
import {
  resolveStudioCanonicalRedirectUrl,
  resolveStudioRewritePathname
} from "@/shared/config/studio-host-rewrite"

const CHECKOUT = "src/features/billing/actions/start-standard-checkout.ts"
const CALLBACK_URL_HELPER = "src/features/billing/lib/callback-url.ts"
const CALLBACK_PAGE = "app/studio/(dashboard)/billing/callback/page.tsx"
const CHECKOUT_BUTTON = "src/features/billing/ui/start-standard-button.tsx"
const COMPLETE_CHECKOUT = "src/features/billing/actions/complete-standard-checkout.ts"
const TOSS_SERVER = "src/features/billing/lib/toss/server.ts"
const MIDDLEWARE = "middleware.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"

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

const checkout = codeOf(CHECKOUT)
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

/* 코드에 있는 그대로의 내부 경로. 이 값이 바뀌면 아래가 전부 흔들린다. */
const CALLBACK_PATH = "/studio/billing/callback"
const FAIL_PATH = "/studio/billing"
const url = (internalPath: string, hostname: string, origin: string) =>
  resolveStudioBillingCallbackUrl({ internalPath, hostname, origin })

console.log("[A] 내부 route 는 그대로다")

check("A) CALLBACK_PATH 상수가 그대로다", checkout.includes(`const CALLBACK_PATH = "${CALLBACK_PATH}"`))
check("A) FAIL_PATH 상수가 그대로다", checkout.includes(`const FAIL_PATH = "${FAIL_PATH}"`))
check("A) 내부 callback route 파일이 그대로 있다", exists(CALLBACK_PAGE))
/* route 를 옮기거나 rename 하지 않았다. */
check("A) /billing/callback route 를 새로 만들지 않았다", !exists("app/billing/callback/page.tsx") && !exists("app/(dashboard)/billing/callback/page.tsx"))
check("A) callback page 가 force-dynamic 그대로다", codeOf(CALLBACK_PAGE).includes('export const dynamic = "force-dynamic"'))

console.log("\n[B-C] production Studio 의 결제 복귀 주소")

equals("B) successUrl", url(CALLBACK_PATH, STUDIO_HOST, STUDIO_ORIGIN), `${STUDIO_ORIGIN}/billing/callback`)
equals(
  "C) failUrl (기존 query 유지)",
  `${url(FAIL_PATH, STUDIO_HOST, STUDIO_ORIGIN)}?billing=failed`,
  `${STUDIO_ORIGIN}/billing?billing=failed`
)
/* host 표기가 흔들려도 같은 주소여야 한다. */
for (const hostname of [STUDIO_HOST.toUpperCase(), `${STUDIO_HOST}:443`, `${STUDIO_HOST}.`]) {
  equals(`B) ${hostname} successUrl`, url(CALLBACK_PATH, hostname, STUDIO_ORIGIN), `${STUDIO_ORIGIN}/billing/callback`)
}
check("C) 실패 query 이름·값을 바꾸지 않았다", checkout.includes("?billing=failed"))
check("C) failUrl 은 여전히 billing 화면으로 간다", url(FAIL_PATH, STUDIO_HOST, STUDIO_ORIGIN).endsWith("/billing"))

console.log("\n[D] /studio prefix 가 붙은 주소를 새로 만들지 않는다")

const GENERATED = [
  url(CALLBACK_PATH, STUDIO_HOST, STUDIO_ORIGIN),
  url(FAIL_PATH, STUDIO_HOST, STUDIO_ORIGIN)
]
for (const generated of GENERATED) {
  check(`D) ${generated} 에 /studio prefix 가 없다`, !new URL(generated).pathname.startsWith("/studio"))
  check(`D) ${generated} 에 중복 slash 가 없다`, !new URL(generated).pathname.includes("//"))
}
check(
  "D) studio.firstsuup.com/studio/billing/callback 이 만들어지지 않는다",
  url(CALLBACK_PATH, STUDIO_HOST, STUDIO_ORIGIN) !== `${STUDIO_ORIGIN}${CALLBACK_PATH}`
)
/* 절대 주소를 코드에 박지 않았다. */
check("D) checkout 이 origin 을 하드코딩하지 않는다", !checkout.includes("firstsuup.com") && !checkout.includes("STUDIO_ORIGIN"))
check("D) helper 도 origin 을 하드코딩하지 않는다", !codeOf(CALLBACK_URL_HELPER).includes("firstsuup.com"))

console.log("\n[E-F] localhost 는 기존 개발 경로를 지킨다")

const LOCAL_CASES: Array<[string, string]> = [
  ["localhost:3000", "http://localhost:3000"],
  ["localhost:3100", "http://localhost:3100"],
  ["127.0.0.1:3000", "http://127.0.0.1:3000"],
  ["studio.localhost", "http://studio.localhost"]
]
for (const [hostname, origin] of LOCAL_CASES) {
  equals(`E) ${origin} successUrl`, url(CALLBACK_PATH, hostname, origin), `${origin}${CALLBACK_PATH}`)
  equals(`E) ${origin} failUrl`, `${url(FAIL_PATH, hostname, origin)}?billing=failed`, `${origin}${FAIL_PATH}?billing=failed`)
  check(`F) ${origin} 는 production 으로 튀지 않는다`, !url(CALLBACK_PATH, hostname, origin).includes("firstsuup.com"))
  /* 포트를 잃으면 결제창이 다른 서버로 돌아온다. */
  check(`F) ${origin} 의 포트가 보존된다`, url(CALLBACK_PATH, hostname, origin).startsWith(origin))
}
/* Parent host 에서 시작하면 그 origin 을 그대로 쓴다 — 억지로 Studio 로 보내지 않는다. */
equals(
  "F) Parent host 는 기존 경로 그대로다",
  url(CALLBACK_PATH, PARENT_HOST, PARENT_ORIGIN),
  `${PARENT_ORIGIN}${CALLBACK_PATH}`
)
check("F) helper 가 요청 origin 을 그대로 쓴다", codeOf(CALLBACK_URL_HELPER).includes("`${origin}${getStudioNavigationPath("))
check("F) helper 가 query 를 붙이지 않는다", !codeOf(CALLBACK_URL_HELPER).includes("billing=") && !codeOf(CALLBACK_URL_HELPER).includes("URLSearchParams"))

console.log("\n[G] clean callback 이 내부 route 로 rewrite 된다")

equals("G) /billing/callback → 내부 경로", resolveStudioRewritePathname(STUDIO_HOST, "/billing/callback"), CALLBACK_PATH)
equals("G) /billing → 내부 경로", resolveStudioRewritePathname(STUDIO_HOST, "/billing"), FAIL_PATH)
/* 결제사가 돌려보낸 주소가 실제 route 에 닿는지 끝까지 따라가 본다. */
const successPathname = new URL(url(CALLBACK_PATH, STUDIO_HOST, STUDIO_ORIGIN)).pathname
equals("G) successUrl 의 pathname 이 내부 route 로 간다", resolveStudioRewritePathname(STUDIO_HOST, successPathname), CALLBACK_PATH)
check("G) 그 내부 route 가 실제로 있다", exists(CALLBACK_PAGE))
const failPathname = new URL(url(FAIL_PATH, STUDIO_HOST, STUDIO_ORIGIN)).pathname
equals("G) failUrl 의 pathname 이 내부 route 로 간다", resolveStudioRewritePathname(STUDIO_HOST, failPathname), FAIL_PATH)
check("G) billing 화면 route 가 실제로 있다", exists("app/studio/(dashboard)/billing/page.tsx"))
/* middleware 의 내부 target 은 그대로다. */
check("G) middleware 가 host rewrite 계약을 그대로 쓴다", middleware.includes("resolveStudioRewritePathname"))
check("G) middleware 에 billing 경로를 하드코딩하지 않았다", !middleware.includes("billing"))

console.log("\n[H] 옛 주소는 canonical redirect 가 계속 받아 준다")

equals(
  "H) /studio/billing/callback → clean 주소",
  resolveStudioCanonicalRedirectUrl(STUDIO_HOST, CALLBACK_PATH),
  `${STUDIO_ORIGIN}/billing/callback`
)
equals(
  "H) query 도 보존한다",
  resolveStudioCanonicalRedirectUrl(STUDIO_HOST, FAIL_PATH, "?billing=failed"),
  `${STUDIO_ORIGIN}/billing?billing=failed`
)
equals(
  "H) Parent host 의 옛 주소도 Studio 로 보낸다",
  resolveStudioCanonicalRedirectUrl(PARENT_HOST, CALLBACK_PATH),
  `${STUDIO_ORIGIN}/billing/callback`
)
/* 하지만 정상 결제는 redirect 를 타지 않는다. */
equals(
  "H) 새 successUrl 은 redirect 대상이 아니다",
  resolveStudioCanonicalRedirectUrl(STUDIO_HOST, successPathname),
  null
)
equals("H) 새 failUrl 도 redirect 대상이 아니다", resolveStudioCanonicalRedirectUrl(STUDIO_HOST, failPathname), null)

console.log("\n[I] 결제 처리 로직 무변경")

/* checkout 이 만지는 것은 URL 두 개뿐이다. */
check("I) 금액은 여전히 서버 카탈로그에서 온다", checkout.includes("amount: plan.amount") && checkout.includes("getPurchasableBillingPlan"))
check("I) orderId 생성이 그대로다", checkout.includes("buildInitialBillingAttempt(sessionId)") && checkout.includes("orderId: attempt.orderId"))
check("I) customerKey 발급이 그대로다", checkout.includes("generateTossCustomerKey()"))
check("I) checkout session 저장이 그대로다", checkout.includes("insertCheckoutSession({"))
check("I) 중복 결제 가드가 그대로다", checkout.includes('billedPlanCode !== "free"'))
check("I) 조직은 여전히 guard 가 정한다", checkout.includes("requireTeacherStudioAccess()"))
check("I) callback URL helper 는 결제 값을 만지지 않는다", (() => {
  const helper = codeOf(CALLBACK_URL_HELPER)
  return ["amount", "orderId", "paymentKey", "authKey", "customerKey", "secretKey", "clientKey"].every(
    (term) => !helper.includes(term)
  )
})())
/* callback page 의 승인 처리도 그대로다. */
const callbackPage = codeOf(CALLBACK_PAGE)
check("I) callback 이 authKey · customerKey 를 그대로 읽는다", callbackPage.includes("customerKey") && callbackPage.includes("authKey"))
check("I) callback 이 completeStandardCheckout 을 부른다", callbackPage.includes("completeStandardCheckout({"))
check("I) callback 이 조직을 guard 에서 얻는다", callbackPage.includes("actorOrganizationId: access.organizationId"))
check("I) 성공/실패 판정이 그대로다", callbackPage.includes('result.status === "activated" ? "activated" : result.status === "pending" ? "pending" : "failed"'))
check("I) complete-standard-checkout 을 건드리지 않았다", exists(COMPLETE_CHECKOUT))
/* client 는 서버가 준 URL 을 그대로 넘긴다. */
const button = codeOf(CHECKOUT_BUTTON)
check("I) client 가 URL 을 만들지 않는다", !button.includes("/studio/billing") && !button.includes("window.location.origin"))
check("I) client 는 서버가 준 값을 그대로 넘긴다", button.includes("successUrl: result.data.successUrl") && button.includes("failUrl: result.data.failUrl"))
check("I) requestBillingAuth 계약이 그대로다", button.includes('method: "CARD"'))

console.log("\n[J] Toss 키 · 환경변수 계약 무변경")

check("J) runtime 은 여전히 조직 기준이다", checkout.includes("getTossRuntimeForOrganization(access.organizationId)"))
check("J) ready 가 아니면 결제창을 열지 않는다", checkout.includes('runtime.status !== "ready"'))
check("J) clientKey 만 client 로 내려간다", checkout.includes("clientKey: runtime.clientKey") && !checkout.includes("secretKey"))
check("J) toss server 모듈을 건드리지 않았다", exists(TOSS_SERVER))
check("J) checkout 이 환경변수를 직접 읽지 않는다", !checkout.includes("process.env"))
check("J) helper 가 환경변수를 읽지 않는다", !codeOf(CALLBACK_URL_HELPER).includes("process.env"))
check("J) origin 은 요청 헤더에서 온다", checkout.includes('headerList.get("x-forwarded-host") ?? headerList.get("host")'))
check("J) protocol 판단이 그대로다", checkout.includes('headerList.get("x-forwarded-proto")'))

console.log("\n[K] middleware cookie 계약 무변경")

check("K) response 는 여전히 한 번만 만들어진다", (middleware.match(/NextResponse\.(next|rewrite|redirect)\(/g) ?? []).length === 3)
check("K) cookie 전파 계약 그대로", middleware.includes("takePendingCookies()") && middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)"))
check("K) Parent matcher 범위가 그대로다", ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"].every((source) =>
  middleware.slice(middleware.indexOf("matcher: [")).split("\n").some((row) => row.trim() === `"${source}",`)
))
for (const [label, code] of [[MIDDLEWARE, middleware], [SUPABASE_MIDDLEWARE, codeOf(SUPABASE_MIDDLEWARE)]] as const) {
  check(`K) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
}
check("K) middleware client 는 여전히 cookie 를 모으기만 한다", (() => {
  const client = codeOf(SUPABASE_MIDDLEWARE)
  return client.includes("pendingCookies.push(cookie)") && !client.includes("NextResponse.")
})())

console.log("\n[L] S4B cross-product 계약 무변경")

check("L) Partner 요금제 CTA 가 그대로다", codeOf("app/partner/PartnerLanding.tsx").includes('studioHref("/studio/billing")'))
check("L) account-conflict 가 그대로다", codeOf("app/auth/account-conflict/page.tsx").includes('resolveStudioCrossProductHref("/studio/sign-in")'))
check("L) require-parent-access 가 그대로다", codeOf("src/features/my/lib/require-parent-access.ts").includes("getStudioCrossProductHref"))
check("L) studio guard 의 Studio→Parent 가 그대로다", codeOf("src/features/studio/lib/require-teacher-studio-access.ts").includes("getParentCrossProductHref"))
check("L) billing 이 cross-product helper 를 쓰지 않는다", !checkout.includes("cross-product-navigation") && !codeOf(CALLBACK_URL_HELPER).includes("cross-product-navigation"))
/* 경로 규칙은 S3D contract 하나만 쓴다. */
check("L) helper 가 S3D contract 를 재사용한다", codeOf(CALLBACK_URL_HELPER).includes("getStudioNavigationPath"))
check("L) helper 가 경로를 다시 매핑하지 않는다", !/"\/studio\//.test(codeOf(CALLBACK_URL_HELPER)))
check("L) DB 마이그레이션을 건드리지 않았다", walk("supabase/migrations").filter((file) => file.endsWith(".sql")).every((file) => !read(file).includes("billing_callback_url")))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
