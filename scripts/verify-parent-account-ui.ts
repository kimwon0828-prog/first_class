// 인증 / 자녀 / 프로필 / 마이 하위 화면 UI 계약 검증 (PARENT PHASE 6.7).
//
//   npx tsx scripts/verify-parent-account-ui.ts
//
// 여기서 고정하는 것.
//   A. 마이페이지 Hub 의 메뉴는 전부 실제로 존재하는 route 로 간다.
//   B. /my 는 탭 root 다 — 뒤로가기를 달지 않고 하단 탭을 유지한다.
//   C. My 하위 화면은 "뒤로가기 + 가운데 제목" 이라는 한 가지 헤더 구조만 쓴다.
//   D. 뒤로가기 터치 타깃은 44px 아래로 내려가지 않는다.
//   E. My 하위 화면은 하단 탭을 유지한다.
//   F. 하단 여백은 --parent-nav-space 토큰 하나로만 잡는다.
//   G. /auth/sign-in 은 탭이 없는 진입 화면이고, 카카오가 유일한 primary CTA 다.
//   H. "조회 실패" 와 "아직 없음" 은 서로 다른 화면이다.
//   I. 관심수업 빈 화면의 CTA 는 Home 하나다.
//   J. 계정 화면에 가짜 신호(별점 · 리뷰 수 · 순위 · 추천 점수)를 그리지 않는다.
//   K. /academies 검색은 /classes 와 같은 명시적 submit 계약을 쓴다.
//
// 소스 검사만 쓴다. DB · 네트워크 · 세션을 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const MY_PAGE = "app/my/page.tsx"
const MY_HUB = "src/features/my/ui/my-hub.tsx"
const MY_HUB_CSS = "src/features/my/ui/my-hub.module.css"
const CHILDREN_CLIENT = "src/features/children/ui/my-children-client.tsx"
const CHILDREN_CSS = "app/my/children/page.module.css"
const PROFILE_PAGE = "app/my/profile/page.tsx"
const PROFILE_CSS = "app/my/profile/page.module.css"
const APPLICATIONS_PAGE = "app/my/applications/page.tsx"
const APPLICATIONS_CSS = "app/my/applications/page.module.css"
const FAVORITES_CLIENT = "app/favorites/favorites-client.tsx"
const FAVORITES_CSS = "app/favorites/favorites.module.css"
const SIGN_IN_PAGE = "app/auth/sign-in/page.tsx"
const SIGN_IN_CSS = "app/auth/sign-in/page.module.css"
const SEARCH_PILL = "src/features/classes/ui/classes-region-select.tsx"
const ACADEMIES_EXPLORER = "src/features/academies/ui/academies-explorer.tsx"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

/** CSS module 에서 선택자 한 덩어리만 꺼낸다. 다른 규칙이 섞이지 않게 한다. */
const ruleOf = (css: string, selector: string) => {
  const match = new RegExp(`\\.${selector}\\s*\\{([^}]*)\\}`).exec(css)
  return match ? match[1] : ""
}
/** `width: 44px` 같은 선언을 숫자로 읽는다. 없으면 null. */
const pxOf = (rule: string, property: string) => {
  const match = new RegExp(`(?:^|;|\\n)\\s*${property}\\s*:\\s*(\\d+)px`).exec(rule)
  return match ? Number(match[1]) : null
}
/** JSX 에서 실제 href 값만 모은다. import 경로가 섞이지 않게 한다. */
const hrefsOf = (code: string) =>
  Array.from(code.matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g)).map(
    (m) => m[1] ?? m[2] ?? m[3] ?? ""
  )

const myPage = codeOf(MY_PAGE)
const myHub = codeOf(MY_HUB)
const myHubCss = read(MY_HUB_CSS)
const childrenClient = codeOf(CHILDREN_CLIENT)
const childrenCss = read(CHILDREN_CSS)
const profilePage = codeOf(PROFILE_PAGE)
const profileCss = read(PROFILE_CSS)
const applicationsPage = codeOf(APPLICATIONS_PAGE)
const applicationsCss = read(APPLICATIONS_CSS)
const favoritesClient = codeOf(FAVORITES_CLIENT)
const favoritesCss = read(FAVORITES_CSS)
const signInPage = codeOf(SIGN_IN_PAGE)
const signInCss = read(SIGN_IN_CSS)
const searchPill = codeOf(SEARCH_PILL)
const academiesExplorer = codeOf(ACADEMIES_EXPLORER)

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("[A] 마이페이지 Hub 메뉴는 전부 실제 route 로 간다")

const HUB_ROUTES: Array<[string, string]> = [
  ["/my/children", "app/my/children/page.tsx"],
  ["/my/applications", "app/my/applications/page.tsx"],
  ["/favorites", "app/favorites/page.tsx"],
  ["/my/profile", "app/my/profile/page.tsx"]
]
const hubHrefs = hrefsOf(myHub)
for (const [href, file] of HUB_ROUTES) {
  check(`A) Hub 에 ${href} 메뉴가 있다`, hubHrefs.includes(href))
  check(`A) ${href} route 가 실제로 있다`, exists(file), file)
}
/* 없는 기능을 메뉴로 만들지 않는다. */
for (const term of ["결제", "구독", "쿠폰", "포인트", "등급"]) {
  check(`A) Hub 에 "${term}" 메뉴가 없다`, !myHub.includes(term))
}
check("A) 로그아웃은 form submit 이다", myHub.includes('action="/auth/sign-out"'))
check(
  "A) 메뉴 줄의 터치 타깃이 44px 이상이다",
  (pxOf(ruleOf(myHubCss, "menuItem"), "min-height") ?? 0) >= 44 &&
    (pxOf(ruleOf(myHubCss, "menuButton"), "min-height") ?? 0) >= 44
)

console.log("\n[B] /my 는 탭 root 다")

check("B) /my 에 뒤로가기가 없다", !myPage.includes("뒤로가기") && !myHub.includes("뒤로가기"))
check("B) /my 에 하단 탭이 있다", myPage.includes("<ParentBottomNav />"))
check("B) /my 는 Hub 이지 dashboard 가 아니다", !myPage.includes("다가오는") && !myHub.includes("다가오는"))

console.log("\n[C][D][E][F] My 하위 화면의 헤더 · 탭 · 하단 여백")

const SUB_SCREENS: Array<{
  label: string
  code: string
  css: string
  /* 뒤로가기가 돌아가는 자리. 하위 화면은 전부 /my 로 올라간다. */
  back: string
  title: string
  shellSelector: string
}> = [
  { label: "/my/children", code: childrenClient, css: childrenCss, back: "/my", title: "자녀 관리", shellSelector: "shell" },
  { label: "/my/profile", code: profilePage, css: profileCss, back: "/my", title: "내 정보", shellSelector: "shell" },
  { label: "/my/applications", code: applicationsPage, css: applicationsCss, back: "/my", title: "신청 현황", shellSelector: "shell" },
  { label: "/favorites", code: favoritesClient, css: favoritesCss, back: "/my", title: "관심수업", shellSelector: "header" }
]

for (const screen of SUB_SCREENS) {
  check(`C) ${screen.label} 에 뒤로가기가 있다`, screen.code.includes('aria-label="뒤로가기"'))
  check(
    `C) ${screen.label} 뒤로가기는 ${screen.back} 로 간다`,
    new RegExp(`href="${screen.back}"[^>]*aria-label="뒤로가기"|aria-label="뒤로가기"[^>]*href="${screen.back}"`).test(
      screen.code.replace(/\s+/g, " ")
    ) || new RegExp(`href="${screen.back}"[^>]*className=\\{[^}]*backButton`).test(screen.code.replace(/\s+/g, " "))
  )
  check(`C) ${screen.label} 제목이 h1 하나다`, (screen.code.match(/<h1/g) ?? []).length === 1)
  check(`C) ${screen.label} 제목이 "${screen.title}" 다`, screen.code.includes(`>${screen.title}</h1>`))
  /* ← 같은 글자를 버튼으로 쓰지 않는다. 아이콘은 inline svg 다. */
  check(`C) ${screen.label} 뒤로가기가 텍스트 화살표가 아니다`, !screen.code.includes(">←<"))

  const backRule = ruleOf(screen.css, "backButton")
  check(
    `D) ${screen.label} 뒤로가기 터치 타깃이 44px 이상이다`,
    (pxOf(backRule, "width") ?? 0) >= 44 && (pxOf(backRule, "height") ?? 0) >= 44,
    `width=${pxOf(backRule, "width")} height=${pxOf(backRule, "height")}`
  )
  const headerRule = ruleOf(screen.css, "header")
  check(
    `C) ${screen.label} 헤더가 44px 1fr 44px grid 다`,
    headerRule.includes("grid-template-columns: 44px 1fr 44px")
  )

  check(`E) ${screen.label} 에 하단 탭이 있다`, screen.code.includes("<ParentBottomNav"))
  check(
    `F) ${screen.label} 에 하드코딩된 하단 여백이 없다`,
    !/paddingBottom:\s*\d/.test(screen.code) && !/padding-bottom:\s*\d+px/.test(screen.css)
  )
}

/* shell 하단 여백은 화면마다 따로 정하지 않는다. */
for (const [label, css] of [
  ["/my/children", childrenCss],
  ["/my/profile", profileCss],
  ["/my/applications", applicationsCss],
  ["/classes(공용 shell)", read("app/classes/page.module.css")]
] as const) {
  check(`F) ${label} shell 이 --parent-nav-space 를 쓴다`, ruleOf(css, "shell").includes("var(--parent-nav-space)"))
}

console.log("\n[G] /auth/sign-in")

check("G) 로그인 화면에는 하단 탭이 없다", !signInPage.includes("ParentBottomNav"))
check("G) 카카오가 유일한 primary CTA 다", (signInPage.match(/<KakaoAuthButton/g) ?? []).length === 1)
check("G) 뒤로가기는 Home(/) 으로 간다", signInPage.includes('<Link href="/" className={styles.backButton}'))
check(
  "G) 뒤로가기 터치 타깃이 44px 이상이다",
  (pxOf(ruleOf(signInCss, "backButton"), "width") ?? 0) >= 44 &&
    (pxOf(ruleOf(signInCss, "backButton"), "height") ?? 0) >= 44
)
/* 명시적으로 넘어온 returnTo 를 덮어쓰지 않는다. */
check("G) returnTo 를 덮어쓰지 않는다", signInPage.includes('next={returnTo ?? "/"}'))
check("G) 외부 주소로는 돌아가지 않는다", read(SIGN_IN_PAGE).includes('!value.startsWith("/") || value.startsWith("//")'))
check("G) 학원 로그인은 보조 링크로 남는다", signInPage.includes('href="/studio/sign-in"'))

console.log("\n[H] 조회 실패와 빈 상태는 다른 화면이다")

check(
  "H) /my/children 은 error 와 ready 를 나눈다",
  childrenClient.includes('status === "error"') && childrenClient.includes('status === "ready"')
)
check(
  "H) /my/children 조회 실패 문구가 따로 있다",
  childrenClient.includes("자녀 정보를 불러오지 못했어요.")
)
check(
  "H) /my/applications 는 error 와 빈 목록을 나눈다",
  applicationsPage.includes("applications.error ?") && applicationsPage.includes("!hasAny ?")
)
check(
  "H) 세션 진단 문자열을 학부모 화면에 그대로 띄우지 않는다",
  childrenClient.includes("shouldShowAuthDebug ?") &&
    childrenClient.includes('process.env.NEXT_PUBLIC_DEBUG_AUTH === "1"')
)

console.log("\n[I] 관심수업 빈 화면")

check("I) 빈 상태 문구가 있다", favoritesClient.includes("아직 관심수업이 없어요."))
check(
  "I) 보조 문구가 있다",
  favoritesClient.includes("마음에 드는 수업을 저장해 두고 다시 확인해 보세요.")
)
check("I) CTA 는 Home 하나다", favoritesClient.includes('<Link href="/" className={styles.retryLink}>'))
check(
  "I) 빈 화면 CTA 가 두 개가 아니다",
  (favoritesClient.match(/className=\{styles\.retryLink\}/g) ?? []).length === 2,
  "학원 계정 안내 1개 + 빈 상태 1개"
)
check("I) 학원 계정은 관심수업을 쓰지 않는다", favoritesClient.includes("학원 계정은 관심수업 기능을 사용할 수 없어요."))

console.log("\n[J] 계정 화면에 가짜 신호가 없다")

const ACCOUNT_SCREENS: Array<[string, string]> = [
  ["/my", myPage + myHub],
  ["/my/children", childrenClient],
  ["/my/profile", profilePage],
  ["/my/applications", applicationsPage],
  ["/favorites", favoritesClient],
  ["/auth/sign-in", signInPage]
]
const FAKE_SIGNALS = ["★", "평점", "별점", "리뷰 수", "인기 순위", "매칭률", "추천 점수", "BEST", "마감 임박", "AI 분석"]
for (const [label, code] of ACCOUNT_SCREENS) {
  for (const term of FAKE_SIGNALS) {
    check(`J) ${label} 에 "${term}" 이 없다`, !code.includes(term))
  }
  /* emoji 를 production icon 으로 쓰지 않는다. */
  check(
    `J) ${label} 에 emoji icon 이 없다`,
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(code),
    "아이콘은 inline svg 로만 그린다"
  )
}

console.log("\n[K] /academies 검색은 /classes 와 같은 명시적 submit 이다")

check("K) 검색 입력은 공용 ClassesSearchPill 하나다", academiesExplorer.includes("ClassesSearchPill"))
check("K) /academies 가 자기 검색 입력을 따로 만들지 않는다", !/<input[^>]*type="search"/.test(academiesExplorer))
check("K) 제출 버튼이 있다", searchPill.includes('type="submit"') && searchPill.includes('aria-label="검색"'))
check("K) 입력 중에는 이동하지 않는다", !searchPill.includes("setTimeout") && !searchPill.includes("debounce"))
/* 입력 handler 안에서 router 를 부르면 다시 자동 검색이 된다. handler 본문만 떼어 본다. */
const pillOnChange = /onChange=\{\(event\) =>\s*(\{[\s\S]*?\}|set[A-Za-z]*\(event\.target\.value\))/.exec(
  searchPill
)?.[1] ?? ""
check(
  "K) onChange 는 값만 바꾼다",
  pillOnChange.includes("setValue(event.target.value)") &&
    !/router\.|submitQuery|startTransition/.test(pillOnChange),
  pillOnChange.replace(/\s+/g, " ")
)
check("K) 이동 대상 pathname 을 호출부가 정한다", searchPill.includes("targetPathname"))
check(
  "K) 죽은 검색 입력 컴포넌트가 남아 있지 않다",
  !searchPill.includes("ClassesSearchInput") && !searchPill.includes("ClassesSubjectGrid")
)

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
