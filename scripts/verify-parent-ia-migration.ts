// Parent IA migration(Phase 6) 의 계약 검증.
//
//   npx tsx scripts/verify-parent-ia-migration.ts
//
// 여기서 고정하는 것.
//   1. 새 IA 의 route 가 전부 살아 있다. 이번 단계에서 아무것도 지우지 않았다.
//   2. /my 는 dashboard 가 아니라 메뉴 Hub 다 — 일정 · 기록을 다시 강조하지 않는다.
//   3. /my 에 없는 기능(결제 · 구독 · 쿠폰 · 포인트)을 메뉴로 만들지 않는다.
//   4. /favorites 는 탭이 아니라 /my 의 "관심수업" 으로 들어간다.
//   5. /my/applications 가 가리던 정보가 /record 에 모두 남아 있다.
//   6. 내부 링크가 redirect 전용 route 를 거치지 않는다.
//   7. Studio auth 흐름을 건드리지 않았다.
//   8. DB · domain 계약을 바꾸지 않았다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"

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

console.log("\n[1] route inventory — 아무것도 지우지 않았다")

const PARENT_ROUTES = [
  "app/page.tsx",
  "app/classes/page.tsx",
  "app/classes/[id]/page.tsx",
  "app/classes/[id]/apply/page.tsx",
  "app/academies/page.tsx",
  "app/academy/[handle]/page.tsx",
  "app/favorites/page.tsx",
  "app/record/page.tsx",
  "app/record/[experienceId]/page.tsx",
  "app/record/[experienceId]/report/page.tsx",
  "app/record/profile/page.tsx",
  "app/my/page.tsx",
  "app/my/schedule/page.tsx",
  "app/my/actions/page.tsx",
  "app/my/applications/page.tsx",
  "app/my/children/page.tsx",
  "app/my/profile/page.tsx",
  "app/auth/sign-in/page.tsx",
  "app/auth/sign-up/page.tsx",
  "app/(legal)/terms/page.tsx",
  "app/(legal)/privacy/page.tsx",
  "app/partner/page.tsx"
]
for (const route of PARENT_ROUTES) {
  check(`${route} 가 남아 있다`, exists(route))
}

console.log("\n[2] /my 는 메뉴 Hub 다")

const hub = codeOf("src/features/my/ui/my-hub.tsx")
const myPage = codeOf("app/my/page.tsx")

check("/my 가 Hub 컴포넌트를 쓴다", myPage.includes("<MyHub"))
check("옛 dashboard 컴포넌트를 남겨 두지 않았다", !exists("src/features/my/ui/my-dashboard-home.tsx"))
check(
  "다가오는 일정을 /my 에서 다시 강조하지 않는다",
  !hub.includes("다음 체험") && !hub.includes("confirmedSlotAt") && !myPage.includes("resolveNextUpcomingApplication")
)
check("진행 중 카운터를 다시 그리지 않는다", !hub.includes("statCard") && !hub.includes("confirmedApplicationCount") && !hub.includes("reviewingApplicationCount"))
check("기록을 메뉴로 중복하지 않는다", !hub.includes('href="/record"'))
for (const term of ["결제", "구독", "쿠폰", "포인트", "멤버십"]) {
  check(`없는 기능 "${term}" 을 만들지 않는다`, !hub.includes(term))
}

console.log("\n[3] /my 메뉴 구성")

const MENU = [
  ["자녀 관리", "/my/children"],
  ["관심수업", "/favorites"],
  ["내 정보 수정하기", "/my/profile"]
] as const
for (const [label, href] of MENU) {
  check(`${label} → ${href}`, hub.includes(`href="${href}"`) && hub.includes(`>${label}<`))
}
check("로그아웃이 남아 있다", hub.includes('action="/auth/sign-out"'))
check("자녀 수는 실제 값이다", hub.includes("${childrenCount}명의 자녀가 등록되어 있어요.") && myPage.includes("childrenCount={children.error ? null : children.data.length}"))
check(
  "약관 · 사업자 정보는 한 자리에 있다",
  myPage.includes('<ParentFooter showLegalLinks={false}') && hub.includes("이용약관")
)
check("조회 실패를 빈 화면으로 접지 않는다", myPage.includes("childrenError={children.error}") && hub.includes("childrenError ?"))

console.log("\n[4] /favorites")

check("route 가 살아 있다", exists("app/favorites/page.tsx"))
check("/my 에서 관심수업으로 들어간다", hub.includes('href="/favorites"'))
check("하단 탭에는 없다", !stripComments(read("src/features/classes/ui/parent-bottom-nav.tsx")).includes('label: "관심수업"'))
check("/favorites 는 마이페이지 탭이다", resolveParentNavTab("/favorites") === "my")

console.log("\n[5] /my/applications — 신청 현황으로 복원됐다")

/*
 * Phase 6 에서는 /record 로 redirect 되어 있었고, 정보 손실이 없는지만 확인했다.
 * Phase 6.2 에서 역할을 나누면서 실제 페이지로 되살렸다 —
 * 신청 상태(new · reviewing · confirmed · canceled)가 사는 자리는 여기 하나다.
 * 상세 규칙은 verify-parent-applications-record 가 본다.
 */
const applicationsPage = codeOf("app/my/applications/page.tsx")
check("redirect 가 아니다", !applicationsPage.includes("redirect("))
check("authenticated page 다", applicationsPage.includes('requireParentAccess({ returnTo: "/my/applications" })'))
check("route 파일이 남아 있다", exists("app/my/applications/page.tsx"))

const recordPage = codeOf("app/record/page.tsx")
const experienceDetail = codeOf("app/record/[experienceId]/page.tsx")
check("/record 는 완료 경험만 담는다", recordPage.includes("selectCompletedExperiences(applications.data)"))
check("취소 수단이 남아 있다", experienceDetail.includes("<ExperienceCancelButton"))
check(
  "취소 후 그 상태가 보이는 자리로 돌아간다",
  stripComments(read("src/features/applications/actions/cancel-my-application.ts")).includes(
    'requireParentAccess({ returnTo: "/my/applications" })'
  )
)

console.log("\n[6] 내부 링크가 redirect 를 거치지 않는다")

/* redirect 전용 route 로 가는 링크는 그 route 자신 말고는 없어야 한다. */
/* 이제 redirect 전용인 route 는 /auth/sign-up 하나다. */
const REDIRECT_ONLY = ["/auth/sign-up"]
for (const route of REDIRECT_ONLY) {
  const hits = execSync(
    `grep -rn 'href="${route}"' app src || true`,
    { cwd: process.cwd(), encoding: "utf8" }
  ).trim()
  check(`${route} 로 가는 링크가 없다`, hits === "", hits)
}
/*
 * 이메일 로그인 화면 아래 링크.
 *
 * ⚠️ 변수 이름이 아니라 두 가지 사실을 고정한다.
 *    1. redirect 를 한 번 더 밟지 않고 최종 목적지(/auth/sign-in)로 바로 간다.
 *    2. 학부모 가입은 카카오 한 길뿐이라, 없는 이메일 가입 화면을
 *       "회원가입" 이라는 라벨로 약속하지 않는다.
 */
const signInFormCode = codeOf("src/features/auth/ui/sign-in-form.tsx")
check(
  "가입 링크가 최종 목적지로 간다",
  signInFormCode.includes('"/auth/sign-in"') && !signInFormCode.includes('"/auth/sign-up"')
)
check("없는 이메일 가입을 약속하지 않는다", !signInFormCode.includes(">회원가입<"))
check("이메일 가입 폼 orphan 을 남기지 않았다", !exists("src/features/auth/ui/sign-up-form.tsx"))
check("/auth/sign-up 은 sign-in 으로 넘긴다", codeOf("app/auth/sign-up/page.tsx").includes("redirect(signInHref)"))

console.log("\n[7] Studio · domain 을 건드리지 않았다")

check("Studio 는 자기 sign-in form 을 쓴다", codeOf("app/studio/sign-in/page.tsx").includes("<StudioSignInForm"))
check("parent SignInForm 은 studio 에서 쓰지 않는다", !codeOf("app/studio/sign-in/page.tsx").includes("<SignInForm"))
check(
  "Studio route 가 그대로다",
  exists("app/studio/sign-in/page.tsx") && exists("app/studio/(dashboard)/page.tsx")
)

const changedFiles = execSync("git status --porcelain", { cwd: process.cwd(), encoding: "utf8" })
check(
  "supabase migration 을 건드리지 않았다",
  !/supabase\/migrations/.test(changedFiles),
  changedFiles.split("\n").filter((line) => line.includes("supabase/")).join(",")
)
check(
  "Report · Decision · RegistrationResult domain 을 건드리지 않았다",
  !/src\/features\/(reports|decisions|registration)\//.test(changedFiles),
  changedFiles.split("\n").filter((line) => /features\/(reports|decisions|registration)/.test(line)).join(",")
)

console.log("\n[8] 하단 탭 active")

for (const [pathname, expected] of [
  ["/my", "my"],
  ["/my/children", "my"],
  ["/my/profile", "my"],
  ["/favorites", "my"],
  ["/my/applications", "my"],
  ["/my/schedule", "schedule"],
  ["/my/actions", "home"]
] as const) {
  check(`${pathname} → ${expected}`, resolveParentNavTab(pathname) === expected, String(resolveParentNavTab(pathname)))
}

console.log("\n[9] 로그인 기본 착지점")

/*
 * returnTo 가 없을 때만 쓰이는 기본값. 학부모의 집은 / 다.
 * /classes 는 검색 결과 화면이지 Home 이 아니다.
 */
const postAuthRedirect = stripComments(read("src/features/auth/lib/redirect.ts"))
const callbackRoute = codeOf("app/auth/callback/route.ts")
const kakaoButton = codeOf("src/features/auth/ui/kakao-auth-button.tsx")
const signInPage = codeOf("app/auth/sign-in/page.tsx")
const emailSignInPage = codeOf("app/auth/sign-in/email/page.tsx")
const signInForm = codeOf("src/features/auth/ui/sign-in-form.tsx")

check(
  "학부모 기본 착지점이 / 다",
  postAuthRedirect.includes('if (role === "parent") {\n    return "/"\n  }'),
  postAuthRedirect.replace(/\s+/g, " ")
)
check("Studio 착지점은 그대로 /studio 다", postAuthRedirect.includes('return "/studio"'))
/*
 * fallback 만 본다.
 *
 * 화면 안의 다른 /classes 링크(뒤로가기 등)는 착지점이 아니므로 여기서 보지 않는다.
 */
const FALLBACK_PATTERNS = ['returnTo ?? "/classes"', 'next={returnTo ?? "/classes"}', 'return "/classes"']
for (const [label, source] of [
  ["auth callback", callbackRoute],
  ["kakao button", kakaoButton],
  ["sign-in page", signInPage],
  ["email sign-in page", emailSignInPage],
  ["sign-in form", signInForm]
] as const) {
  check(
    `${label} 의 기본 착지점이 /classes 가 아니다`,
    FALLBACK_PATTERNS.every((pattern) => !source.includes(pattern)),
    FALLBACK_PATTERNS.filter((pattern) => source.includes(pattern)).join(" | ")
  )
}

/* 명시적으로 넘어온 목적지는 절대 덮어쓰지 않는다. */
check(
  "returnTo 가 있으면 그쪽이 우선이다",
  signInPage.includes("returnTo ?? ") &&
    emailSignInPage.includes("returnTo ?? ") &&
    signInForm.includes("next={returnTo ?? ") &&
    stripComments(read("src/features/auth/actions/sign-in.ts")).includes("returnTo ?? resolvePostAuthRedirect")
)
check(
  "callback 은 넘어온 next 를 그대로 쓴다",
  callbackRoute.includes('resolveSafeNext(requestUrl.searchParams.get("next"))') &&
    callbackRoute.includes('profile.role === "parent" ? next :')
)

/* 외부 주소 차단은 그대로여야 한다 — 기본값만 바뀌었다. */
/*
 * ⚠️ 여기서는 주석을 걷어내지 않은 원본을 본다.
 *    stripComments 가 문자열 안의 "//" 를 줄 주석으로 오해해 지워 버린다.
 */
for (const [label, path] of [
  ["auth callback", "app/auth/callback/route.ts"],
  ["kakao button", "src/features/auth/ui/kakao-auth-button.tsx"]
] as const) {
  check(
    `${label} 이 외부 · 프로토콜 상대주소를 막는다`,
    read(path).includes('!normalized.startsWith("/") || normalized.startsWith("//")'),
    label
  )
}
check(
  "sign-in page 의 returnTo 검증이 그대로다",
  read("app/auth/sign-in/page.tsx").includes('!value.startsWith("/") || value.startsWith("//")')
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
