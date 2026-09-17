// Parent / Studio 로그인 진입점 분리 계약 검증 (STUDIO SUBDOMAIN S2).
//
//   npx tsx scripts/verify-auth-entry-separation.ts
//
// 여기서 고정하는 것.
//   A. Parent sign-in 화면에 /studio/sign-in 링크가 없다.
//   B. Parent sign-in UI 에 Studio 유입 문구가 없다.
//   C. Studio sign-in form 에 Parent 로그인 CTA 가 없다.
//   D. Studio sign-in route(/studio/sign-in) 자체는 그대로 살아 있다.
//   E. KakaoAuthButton 계약이 바뀌지 않았다.
//   F. middleware 가 Parent 범위를 넓히지 않았다.
//   G. cookie 계약이 바뀌지 않았다 — domain 을 심지 않는다.
//   H. OAuth callback 이 바뀌지 않았다 — 여전히 같은 origin 안에서만 돈다.
//   I. shared auth recovery route 와 ?type=academy 구조는 아직 그대로다.
//
// S2 는 "진입점 UI 분리"까지만 했다. host rewrite 계약은 verify-studio-host-rewrite 가 본다.
// 소스 검사만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const PARENT_SIGN_IN_PAGE = "app/auth/sign-in/page.tsx"
const PARENT_EMAIL_SIGN_IN_PAGE = "app/auth/sign-in/email/page.tsx"
const PARENT_SIGN_IN_FORM = "src/features/auth/ui/sign-in-form.tsx"
const STUDIO_SIGN_IN_PAGE = "app/studio/sign-in/page.tsx"
const STUDIO_SIGN_IN_FORM = "src/features/studio/ui/studio-sign-in-form.tsx"
const KAKAO_BUTTON = "src/features/auth/ui/kakao-auth-button.tsx"
const MIDDLEWARE = "middleware.ts"
const SUPABASE_SERVER = "src/integrations/supabase/server.ts"
const SUPABASE_MIDDLEWARE = "src/integrations/supabase/middleware.ts"
const OAUTH_CALLBACK = "app/auth/callback/route.ts"
const ACCOUNT_CONFLICT_PAGE = "app/auth/account-conflict/page.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))
/** JSX 에서 실제 href 값만 모은다. import 경로가 섞이지 않게 한다. */
const hrefsOf = (code: string) =>
  Array.from(code.matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)).map(
    (m) => m[1] ?? m[2] ?? m[3] ?? ""
  )

const parentSignInPage = codeOf(PARENT_SIGN_IN_PAGE)
const parentEmailSignInPage = codeOf(PARENT_EMAIL_SIGN_IN_PAGE)
const parentSignInForm = codeOf(PARENT_SIGN_IN_FORM)
const studioSignInPage = codeOf(STUDIO_SIGN_IN_PAGE)
const studioSignInForm = codeOf(STUDIO_SIGN_IN_FORM)
const kakaoButton = codeOf(KAKAO_BUTTON)
const middleware = codeOf(MIDDLEWARE)
const supabaseServer = codeOf(SUPABASE_SERVER)
const supabaseMiddleware = codeOf(SUPABASE_MIDDLEWARE)
const oauthCallback = codeOf(OAUTH_CALLBACK)
const accountConflictPage = codeOf(ACCOUNT_CONFLICT_PAGE)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("[A] Parent sign-in 에 /studio/sign-in 링크가 없다")

const PARENT_SIGN_IN_SURFACES: Array<[string, string]> = [
  [PARENT_SIGN_IN_PAGE, parentSignInPage],
  [PARENT_EMAIL_SIGN_IN_PAGE, parentEmailSignInPage],
  [PARENT_SIGN_IN_FORM, parentSignInForm]
]

for (const [label, code] of PARENT_SIGN_IN_SURFACES) {
  check(`A) ${label} 에 /studio/sign-in href 가 없다`, !hrefsOf(code).some((href) => href.includes("/studio/sign-in")))
  /* href 밖(router.push · redirect · 문자열)으로도 새지 않게 한다. */
  check(`A) ${label} 어디에도 /studio 경로가 없다`, !code.includes("/studio"))
}

console.log("\n[B] Parent sign-in UI 에 Studio 유입 문구가 없다")

const STUDIO_COPY = [
  "학원 로그인",
  "선생님 로그인",
  "선생님·학원 관리자이신가요",
  "선생님/학원 관리자이신가요",
  "학원 관리자",
  "파트너 센터",
  "운영보드"
]

for (const [label, code] of PARENT_SIGN_IN_SURFACES) {
  for (const term of STUDIO_COPY) {
    check(`B) ${label} 에 "${term}" 문구가 없다`, !code.includes(term))
  }
}

/* 죽은 style hook 이 남으면 다음 사람이 다시 살려 붙인다. */
const parentSignInCss = read("app/auth/sign-in/page.module.css")
for (const selector of ["studioNotice", "studioLink"]) {
  check(`B) page.module.css 에 .${selector} 가 남아 있지 않다`, !parentSignInCss.includes(`.${selector}`))
}

console.log("\n[C] Studio sign-in form 에 Parent 로그인 CTA 가 없다")

check(
  "C) Studio sign-in form 에 /auth/sign-in href 가 없다",
  !hrefsOf(studioSignInForm).some((href) => href.split("?")[0] === "/auth/sign-in")
)
for (const term of ["학부모이신가요", "학부모 로그인"]) {
  check(`C) Studio sign-in form 에 "${term}" 문구가 없다`, !studioSignInForm.includes(term))
}
check(
  "C) Studio sign-in page 에도 Parent 로그인 CTA 가 없다",
  !hrefsOf(studioSignInPage).some((href) => href.split("?")[0] === "/auth/sign-in")
)

console.log("\n[D] Studio sign-in route 는 그대로 유지된다")

check(`D) ${STUDIO_SIGN_IN_PAGE} 가 있다`, exists(STUDIO_SIGN_IN_PAGE))
check("D) Studio 는 자기 sign-in form 을 쓴다", studioSignInPage.includes("<StudioSignInForm"))
check("D) parent SignInForm 을 Studio 에서 쓰지 않는다", !studioSignInPage.includes("<SignInForm"))
/* S2 에서는 아직 studio.firstsuup.com/auth/sign-in 으로 옮기지 않는다. */
check("D) Studio auth route 를 아직 옮기지 않았다", !exists("app/studio/auth/sign-in/page.tsx"))
check("D) Studio 계정 신청 링크는 남는다", hrefsOf(studioSignInForm).includes("/studio/sign-up"))

/* Studio 로 보내던 나머지 진입점은 이번 단계에서 건드리지 않는다. */
check("D) account-conflict 는 여전히 Studio 로 보낸다", hrefsOf(accountConflictPage).includes("/studio/sign-in"))
check(
  "D) studio access 가드는 여전히 /studio/sign-in 으로 보낸다",
  codeOf("src/features/studio/lib/require-teacher-studio-access.ts").includes('redirect("/studio/sign-in")')
)

console.log("\n[E] KakaoAuthButton 계약 무변경")

check("E) provider 는 kakao 다", kakaoButton.includes('provider: "kakao"'))
check(
  "E) scope 가 그대로다",
  kakaoButton.includes(
    'const KAKAO_SCOPE = "account_email name birthyear phone_number profile_nickname profile_image"'
  )
)
check(
  "E) redirectTo 는 같은 origin 의 /auth/callback 이다",
  kakaoButton.includes("const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent(resolveSafeNext(next))}`")
)
check("E) origin 은 브라우저에서 읽는다", kakaoButton.includes("const origin = window.location.origin"))
/* S2 에서는 cross-host redirectTo 를 만들지 않는다. */
check(
  "E) 절대 주소를 박아 넣지 않는다",
  !kakaoButton.includes("firstsuup.com") &&
    !kakaoButton.includes("STUDIO_ORIGIN") &&
    !kakaoButton.includes("PARENT_ORIGIN")
)
/* 주석 제거기가 "//" 를 주석으로 오해한다. 이 가드만 원본에서 읽는다. */
check(
  "E) 외부 주소 차단 규칙이 그대로다",
  read(KAKAO_BUTTON).includes('!normalized.startsWith("/") || normalized.startsWith("//")')
)
check("E) Parent sign-in 의 primary CTA 는 카카오 하나다", (parentSignInPage.match(/<KakaoAuthButton/g) ?? []).length === 1)
check("E) returnTo 를 덮어쓰지 않는다", parentSignInPage.includes('next={returnTo ?? "/"}'))

console.log("\n[F] middleware 는 Parent 범위를 넓히지 않는다")

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
check("F) Parent matcher 범위가 그대로다", parentMatcherIsIntact(middleware))
check("F) 세션 갱신만 한다", middleware.includes("await supabase.auth.getClaims()"))
for (const term of ["nextUrl.host", "STUDIO_ORIGIN", "PARENT_ORIGIN"]) {
  check(`F) middleware 에 ${term} 가 없다`, !middleware.includes(term))
}
/* S3C: routing canonicalization 을 위한 redirect 는 있다. 권한 판정은 없다. */
check(
  "F) middleware 는 authz 판단을 하지 않는다",
  ["profiles", "role", "organization_id", "requireParentAccess", "requireTeacherStudioAccess"].every(
    (term) => !middleware.includes(term)
  )
)
check("F) middleware 의 redirect 는 canonical Studio URL 뿐이다", (middleware.match(/NextResponse\.redirect\(/g) ?? []).length === 1)

console.log("\n[G] cookie 계약 무변경")

for (const [label, code] of [
  [SUPABASE_SERVER, supabaseServer],
  [SUPABASE_MIDDLEWARE, supabaseMiddleware]
] as const) {
  /* subdomain 공유 cookie 는 S2 범위가 아니다. domain 을 심는 순간 계약이 바뀐다. */
  check(`G) ${label} 이 cookie domain 을 지정하지 않는다`, !/\bdomain\s*:/.test(code))
  check(`G) ${label} 이 sameSite 를 새로 지정하지 않는다`, !/\bsameSite\s*:/.test(code))
}
check("G) 서버 client 는 cookieStore 로 읽고 쓴다", supabaseServer.includes("cookieStore.set(cookie.name, cookie.value, cookie.options)"))
check("G) 서버 client 가 cookie options 를 그대로 넘긴다", supabaseServer.includes("cookie.options"))
/* S3B: middleware 는 cookie 를 모아 두고, 최종 response 에 한 번 적는다. */
check(
  "G) middleware client 는 request cookie 를 갱신하고 쓸 cookie 를 모은다",
  supabaseMiddleware.includes("request.cookies.set(cookie.name, cookie.value)") &&
    supabaseMiddleware.includes("pendingCookies.push(cookie)")
)
check(
  "G) 모은 cookie 는 options 채로 최종 response 에 적힌다",
  middleware.includes("response.cookies.set(cookie.name, cookie.value, cookie.options)")
)

console.log("\n[H] OAuth callback 무변경")

check("H) code 를 세션으로 교환한다", oauthCallback.includes("supabase.auth.exchangeCodeForSession(code)"))
check(
  "H) 외부 주소 차단 규칙이 그대로다",
  read(OAUTH_CALLBACK).includes('!normalized.startsWith("/") || normalized.startsWith("//")')
)
/* 모든 redirect 가 요청 origin 안에서만 돈다 — cross-host 이동은 다음 Phase 다. */
const callbackRedirects = Array.from(oauthCallback.matchAll(/NextResponse\.redirect\(\s*new URL\(([\s\S]*?)\)\s*\)/g))
check("H) callback 의 redirect 가 남아 있다", callbackRedirects.length > 0, `${callbackRedirects.length}건`)
for (const [index, match] of callbackRedirects.entries()) {
  check(
    `H) redirect #${index + 1} 이 requestUrl.origin 기준이다`,
    match[1].includes("requestUrl.origin"),
    match[1].replace(/\s+/g, " ").slice(0, 100)
  )
}
check(
  "H) callback 이 절대 주소를 만들지 않는다",
  !oauthCallback.includes("firstsuup.com") &&
    !oauthCallback.includes("STUDIO_ORIGIN") &&
    !oauthCallback.includes("PARENT_ORIGIN") &&
    !oauthCallback.includes("toStudioUrl") &&
    !oauthCallback.includes("toParentUrl")
)
check("H) studio 계정은 여전히 account-conflict 로 보낸다", oauthCallback.includes('"/auth/account-conflict?reason=studio_account"'))

console.log("\n[I] shared auth recovery 구조는 아직 그대로다")

const SHARED_AUTH_ROUTES = [
  "app/auth/find-email/page.tsx",
  "app/auth/reset-password/page.tsx",
  "app/auth/update-password/page.tsx",
  "app/auth/recovery/page.tsx"
]
for (const route of SHARED_AUTH_ROUTES) {
  check(`I) ${route} 가 그대로 있다`, exists(route))
}
/* ?type=academy 는 host 분리와 함께 정리한다. 지금 떼면 Studio 복구 흐름이 끊긴다. */
check(
  "I) Studio form 이 ?type=academy 복구 링크를 유지한다",
  hrefsOf(studioSignInForm).includes("/auth/find-email?type=academy") &&
    hrefsOf(studioSignInForm).includes("/auth/reset-password?type=academy")
)
check(
  "I) Parent form 은 type 없이 복구 링크를 쓴다",
  hrefsOf(parentSignInForm).includes("/auth/find-email") &&
    hrefsOf(parentSignInForm).includes("/auth/reset-password")
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
