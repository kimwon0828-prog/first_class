// Phase 1 route/query contracts. No network, auth or database operations.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"
import { parentDetailHref, parentEntryHref, safeParentReturnTo, withParentChild } from "@/features/classes/lib/parent-navigation"
const read = (path: string) => readFileSync(path, "utf8")
const matrix = [
  ["/", "home", "app/page.tsx"],
  ["/classes", null, "app/classes/page.tsx"],
  ["/classes/sample", null, "app/classes/[id]/page.tsx"],
  ["/academies", null, "src/features/academies/ui/academies-frame.tsx"],
  ["/academy/sample", null, "src/features/academies/ui/academy-detail-frame.tsx"],
  ["/favorites", null, "app/favorites/favorites-frame.tsx"],
  ["/my/schedule", "schedule", "src/features/schedule/ui/parent-schedule-screen.tsx"],
  ["/record", "record", "src/features/record/ui/record-home.tsx"],
  ["/record/sample", "record", "app/record/[experienceId]/page.tsx"],
  ["/record/sample/report", "record", "app/record/[experienceId]/report/report-frame.tsx"],
  ["/record/profile", "record", "app/record/profile/profile-frame.tsx"],
  ["/my", "my", "app/my/my-frame.tsx"],
  ["/my/children", "my", "src/features/children/ui/children-frame.tsx"],
  ["/my/applications", "my", "app/my/applications/applications-frame.tsx"],
  ["/my/profile", "my", "app/my/profile/profile-frame.tsx"],
  ["/notifications", null, "src/features/notifications/ui/notifications-frame.tsx"]
] as const
for (const [route, active, file] of matrix) {
  assert.equal(resolveParentNavTab(route), active, route)
  const source = read(file)
  assert(source.includes("<ParentAppShell"), file)
  assert(source.includes("<ParentHeader"), file)
  assert(!source.includes("<ParentBottomNav"), `${file}: navigation must be delegated`)
  assert.equal(source.includes("navigation={false}"), route === "/notifications", route)
}
assert(read("src/features/classes/ui/parent-app-shell.tsx").includes('<ParentBottomNav {...navigation} designVersion="v1"'))
assert(!read("app/classes/page.tsx").includes("ParentProfileAvatar"))
assert(!read("app/page.tsx").includes("ParentProfileAvatar"))
assert(read("app/my/page.tsx").includes("<ParentFooter"))
assert(!read("src/features/classes/ui/parent-bottom-nav.tsx").includes('"이동 중"'))
assert(!read("app/classes/[id]/apply/loading.tsx").includes("잠시만 기다려 주세요."))
assert(read("app/classes/[id]/apply/loading.tsx").includes('aria-busy="true"'))
assert(read("app/classes/[id]/page.module.css").includes('nav[data-hidden="true"]'))
assert(read("app/classes/[id]/page.tsx").includes("secondaryAction={favoritesEnabled ? <BookmarkButton"))
console.log("PASS 16-route shell/header coverage, notification exclusion, active state, preserved footer/loading")

const child = "owned-child"
for (const route of ["/", "/my/schedule", "/record", "/my"]) {
  const target = new URL(withParentChild(route, child), "https://parent.test")
  assert.equal(target.searchParams.get("child"), child)
  assert.equal(target.searchParams.size, 1)
}
assert.equal(withParentChild("/record?child=explicit", child), "/record?child=explicit")
assert.equal(withParentChild("https://studio.firstsuup.com/studio", child), "https://studio.firstsuup.com/studio")
const signIn = new URL(withParentChild("/auth/sign-in?returnTo=%2Frecord", child), "https://parent.test")
assert.equal(signIn.searchParams.get("returnTo"), "/record?child=owned-child")
const list = "/classes?q=%ED%94%BC%EC%95%84%EB%85%B8&subject=music&sido=seoul&child=owned-child"
const detail = parentDetailHref("/classes/class-1", list)
const detailUrl = new URL(detail, "https://parent.test")
assert.equal(detailUrl.searchParams.get("returnTo"), list)
assert.equal(detailUrl.searchParams.get("child"), child)
assert.equal(detailUrl.searchParams.get("q"), null)
const report = new URL(parentDetailHref("/record/a/report", "/record/a?child=owned-child&returnTo=%2Fmy%2Fschedule"), "https://parent.test")
assert.equal(report.searchParams.get("returnTo"), "/record/a?child=owned-child&returnTo=%2Fmy%2Fschedule")
assert.equal(parentEntryHref("/record/a", { child, returnTo: list, edit: "profile", q: "discard" }), `/record/a?child=owned-child&returnTo=${encodeURIComponent(list)}`)
assert.equal(withParentChild("/my?edit=profile", child), "/my?edit=profile&child=owned-child")
for (const unsafe of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/studio", "/api/delete", "/classes/a/apply", "/auth/sign-out", "/classes\n"]) assert.equal(safeParentReturnTo(unsafe), null, unsafe)
assert.equal(safeParentReturnTo("/academies?q=music&grade=3"), "/academies?q=music&grade=3")
console.log("PASS child-only tab propagation, auth return, list/detail/report chain, My edit, unsafe return rejection")
