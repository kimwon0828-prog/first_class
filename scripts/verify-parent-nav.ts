// 학부모 하단 탭(ParentBottomNav)의 계약 검증.
//
//   npx tsx scripts/verify-parent-nav.ts
//
// 여기서 고정하는 것.
//   1. 탭은 넷이다: 홈 / · 일정 /my/schedule · 기록 /record · 마이페이지 /my.
//   2. "수업찾기" 는 탭이 아니다. /classes route 와 화면은 그대로 살아 있다.
//   3. active 는 언제나 최대 하나다. /my/schedule 은 마이페이지보다 우선한다.
//   4. /favorites 는 탭에 없지만 마이페이지로 읽는다(route 는 유지).
//   5. 모든 학부모 화면이 이 하나의 nav 를 쓴다. 화면별 nav 를 다시 만들지 않는다.
//   6. 탭마다 touch target 이 44px 아래로 내려가지 않는다.
//   7. floating nav 가 본문을 가리지 않도록 공통 token 으로 아래를 비운다.
//   8. emoji 를 아이콘으로 쓰지 않고, 아이콘 package 를 추가하지 않는다.
//
// 순수 함수와 소스 검사만 쓴다. DB · 네트워크를 건드리지 않는다.

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { resolveParentNavTab, type ParentNavTab } from "@/features/classes/lib/parent-nav"

const NAV_PATH = "src/features/classes/ui/parent-bottom-nav.tsx"
const NAV_CSS_PATH = "src/features/classes/ui/parent-bottom-nav.module.css"
const GLOBAL_CSS_PATH = "app/globals.css"
const PACKAGE_PATH = "package.json"

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8")
const exists = (path: string) => existsSync(resolve(process.cwd(), path))
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")
const stripJsxComments = (source: string) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const codeOf = (path: string) => stripComments(stripJsxComments(read(path)))

const nav = codeOf(NAV_PATH)
const navCss = stripComments(read(NAV_CSS_PATH))
const globalCss = stripComments(read(GLOBAL_CSS_PATH))
const packageJson = JSON.parse(read(PACKAGE_PATH)) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

let failures = 0
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures += 1
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `\n        ${detail}` : ""}`)
}

console.log("\n[1] 탭은 넷이다")

const labels = [...nav.matchAll(/label: "([^"]+)"/g)].map((match) => match[1])
check("홈 · 일정 · 기록 · 마이페이지", labels.join(",") === "홈,일정,기록,마이페이지", labels.join(","))
check('"수업찾기" 탭이 없다', !labels.includes("수업찾기"))
check('"관심수업" 탭이 없다', !labels.includes("관심수업"))
check('"내 신청" 탭이 없다', !labels.includes("내 신청"))
check('홈 탭은 "/" 다', nav.includes('tab: "home", href: "/"'))
check("일정 탭은 /my/schedule 이다", nav.includes('scheduleHref = "/my/schedule"'))
check("기록 탭은 /record 다", nav.includes('recordHref = "/record"'))
check("마이페이지 탭은 /my 다", nav.includes('myPageHref = "/my"'))

console.log("\n[2] route 별 active 계약")

const EXPECTED: ReadonlyArray<readonly [string, ParentNavTab | null]> = [
  ["/", "home"],
  ["/classes", "home"],
  ["/classes/abc-123", "home"],
  ["/academies", "home"],
  ["/academy/some-handle", "home"],
  ["/my/schedule", "schedule"],
  // Action Center 는 Home 흐름의 상세 화면이다. 마이페이지가 아니다.
  ["/my/actions", "home"],
  ["/my/schedule/anything", "schedule"],
  ["/record", "record"],
  ["/record/abc-123", "record"],
  ["/record/abc-123/report", "record"],
  ["/my", "my"],
  ["/my/children", "my"],
  ["/my/profile", "my"],
  ["/my/applications", "my"],
  ["/favorites", "my"],
  // 탭 밖의 화면은 아무 탭도 켜지 않는다.
  ["/auth/sign-in", null],
  ["/classes/abc/apply", "home"],
  ["/partner", null],
  ["/terms", null],
  ["/studio", null]
]
for (const [pathname, expected] of EXPECTED) {
  const actual = resolveParentNavTab(pathname)
  check(`${pathname} → ${expected ?? "없음"}`, actual === expected, `실제: ${actual ?? "없음"}`)
}

check(
  "/my/schedule 은 마이페이지보다 우선한다",
  resolveParentNavTab("/my/schedule") !== "my"
)
// 같은 pathname 이 두 탭으로 해석될 수 없다 — 반환값이 하나뿐이라 구조적으로 보장된다.
check(
  "한 화면에서 active 는 최대 하나다",
  EXPECTED.every(([pathname]) => {
    const tab = resolveParentNavTab(pathname)
    return tab === null || ["home", "schedule", "record", "my"].includes(tab)
  })
)
check(
  "render 가 active 를 그 하나로만 켠다",
  nav.includes("const isActive = activeTab === item.tab") &&
    nav.includes('aria-current={isActive ? "page" : undefined}')
)
check("active 를 밖에서 주입하지 않는다", !nav.includes("active?:") && !nav.includes("active="))

console.log("\n[3] 모든 학부모 화면이 같은 nav 를 쓴다")

check("수업찾기는 하단 nav 를 렌더하지 않는다", !codeOf("app/classes/page.tsx").includes("<ParentBottomNav"))

const NAV_SCREENS = [
  "app/page.tsx",
  "app/record/page.tsx",
  "app/my/page.tsx",
  "src/features/schedule/ui/parent-schedule-screen.tsx",
  "app/academies/page.tsx",
  "app/favorites/favorites-client.tsx",
  "src/features/children/ui/my-children-client.tsx"
]
for (const path of NAV_SCREENS) {
  check(`${path} 가 공용 nav 를 쓴다`, codeOf(path).includes("<ParentBottomNav"))
  check(`${path} 에 직접 만든 탭이 없다`, !codeOf(path).includes('aria-label="하단 탭"'))
}

console.log("\n[4] 삭제 금지 route")

for (const route of [
  "app/favorites/page.tsx",
  "app/my/applications/page.tsx",
  "app/classes/page.tsx",
  "app/academies/page.tsx",
  "app/my/children/page.tsx"
]) {
  check(`${route} 가 남아 있다`, exists(route))
}
check("/my/actions 가 있다", exists("app/my/actions/page.tsx"))

console.log("\n[5] floating navigation")

check("바닥에 붙이지 않고 띄운다", navCss.includes("position: fixed") && navCss.includes("bottom: calc(var(--parent-nav-inset)"))
check("좌우로 inset 을 준다", navCss.includes("width: calc(100% - var(--parent-nav-inset) * 2)"))
check("둥근 컨테이너다", /border-radius:\s*2\dpx/.test(navCss))
check("반투명 surface 다", navCss.includes("background: rgba(255, 255, 255, 0.86)"))
check("backdrop blur 를 쓴다", navCss.includes("backdrop-filter: blur("))
check("얇은 테두리가 있다", navCss.includes("border: 1px solid rgba(15, 23, 42, 0.07)"))
check(
  "과한 그림자를 쓰지 않는다",
  /box-shadow:\s*0 4px 16px/.test(navCss) && !/box-shadow:[^;]*\d{2,}px\s+\d{2,}px/.test(navCss.replace("0 4px 16px", ""))
)
check("active 는 soft pill 하나다", navCss.includes(".navItemActive {") && navCss.includes("background: var(--brand-50)"))
check("아이콘 + 라벨이다", nav.includes("{item.icon}") && nav.includes("styles.navLabel"))
check(
  "탭 touch target 이 44px 이상이다",
  navCss.includes("min-width: 44px") && navCss.includes("min-height: 44px")
)
check("가짜 OS chrome 을 그리지 않는다", !nav.includes("status-bar") && !nav.includes("9:41"))

console.log("\n[6] 본문 여백")

check("공통 token 이 있다", globalCss.includes("--parent-nav-space: calc("))
check("nav 높이 · inset 을 token 으로 둔다", globalCss.includes("--parent-nav-h") && globalCss.includes("--parent-nav-inset"))
const PADDED_SCREENS = [
  "app/page.module.css",
  "app/classes/page.module.css",
  "app/record/page.module.css",
  "app/my/page.module.css",
  "src/features/schedule/ui/parent-schedule-screen.module.css",
  "app/my/children/page.module.css",
  "app/my/applications/page.module.css"
]
for (const path of PADDED_SCREENS) {
  check(`${path} 가 공통 token 으로 아래를 비운다`, (path === "app/classes/page.module.css" && read("app/classes/page.tsx").includes("className={homeStyles.shell}")
    ? read("app/page.module.css") : read(path)).includes("padding-bottom: var(--parent-nav-space);"))
}

console.log("\n[7] 아이콘")

check(
  "네 아이콘이 모두 inline SVG 다",
  ["HomeIcon", "ScheduleIcon", "RecordIcon", "MyIcon"].every((name) => nav.includes(`const ${name} = ()`)) &&
    (nav.match(/<svg /g)?.length ?? 0) === 4
)
check("emoji 를 쓰지 않는다", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(nav))
const deps = { ...(packageJson.dependencies ?? {}), ...(packageJson.devDependencies ?? {}) }
const ICON_PACKAGES = ["lucide-react", "react-icons", "@heroicons/react", "@tabler/icons-react", "phosphor-react"]
check("아이콘 package 를 추가하지 않았다", ICON_PACKAGES.every((name) => !(name in deps)))

console.log(failures === 0 ? "\nALL PASS" : `\nFAIL: ${failures}건 실패`)
process.exit(failures === 0 ? 0 : 1)
