// Pure navigation/security checks; no DB or network writes.
import assert from "node:assert/strict"
import { formatSeoulDateTime } from "@/features/studio/lib/seoul-datetime"
import { readFileSync } from "node:fs"
import { resolveStudioDetailReturn } from "@/features/studio/lib/studio-detail-navigation"
import { getStudioNavigationPath } from "@/shared/config/studio-navigation"
import { getParentCrossProductHref } from "@/shared/config/cross-product-navigation"

const cases = resolveStudioDetailReturn("/studio/cases?view=closed&filter=enrolled&q=김가온&page=3&secret=discard")
assert.equal(cases.pathname, "/studio/cases")
const params = new URLSearchParams(cases.search)
assert.equal(params.get("q"), "김가온")
assert.equal(params.get("page"), "3")
assert.equal(params.get("filter"), "enrolled")
assert.equal(params.has("secret"), false)
for (const view of ["day", "week", "month"]) {
  const schedule = resolveStudioDetailReturn(`/studio/schedule?view=${view}&date=2026-09-22&teacherId=t1&classId=c1&status=confirmed`)
  assert.equal(new URLSearchParams(schedule.search).get("view"), view)
  assert.equal(new URLSearchParams(schedule.search).get("date"), "2026-09-22")
  assert.equal(new URLSearchParams(schedule.search).get("teacherId"), "t1")
}
assert.equal(resolveStudioDetailReturn("/studio?preset=this_month").pathname, "/studio")
for (const unsafe of [null, [], "https://evil.test/studio", "//evil.test/studio", "/studio\\evil", "/studio/classes", "/studio/cases\n", "/studio/cases/../../auth/sign-out"]) {
  assert.deepEqual(resolveStudioDetailReturn(unsafe), resolveStudioDetailReturn(undefined))
}
assert.equal(getStudioNavigationPath({ internalPath: cases.pathname, hostname: "studio.firstsuup.com" }), "/cases")
assert.equal(getStudioNavigationPath({ internalPath: cases.pathname, hostname: "localhost" }), "/studio/cases")
assert.equal(getParentCrossProductHref({ pathname: "/classes/class-1", hostname: "studio.firstsuup.com" }), "https://firstsuup.com/classes/class-1")

const read = (p: string) => readFileSync(p, "utf8")
const dashboard = read("app/studio/(dashboard)/page.tsx")
const workflow = read("src/features/studio/ui/application-trial-result-workflow.tsx")
const source = read("src/features/studio/ui/studio-detail-link.tsx")
const sections = ["dashboard-flow-title", "dashboard-trial-title", "dashboard-registration-chart-title", "dashboard-actions-title", "dashboard-schedule-title", "dashboard-registration-title"]
assert.deepEqual([...sections].sort((a, b) => dashboard.indexOf(a) - dashboard.indexOf(b)), sections)
assert.ok(!dashboard.includes("getConsultationPipelineApplications"))
assert.ok(source.includes("useStudioInternalPathname()"))
assert.ok(source.includes("studioPath(internalPath)"))
assert.ok(source.includes("resolveStudioDetailReturn"))
assert.ok(workflow.includes('event.kind === "consultation"'))
assert.ok(workflow.includes('event.kind !== "consultation"'))
const render = workflow.slice(workflow.indexOf("{nextTodoSection}"))
const ordered = ["{nextTodoSection}", "{referenceSections}", "{activitySection}", "{trialResultSection}", "{isCompletedView ? reportSection : null}", "{isCompletedView ? parentDecisionSection : null}", "{registrationConsultationSection}", "{systemSection}"]
assert.deepEqual([...ordered].sort((a,b)=>render.indexOf(a)-render.indexOf(b)), ordered)
assert.ok(read("src/features/studio/ui/studio-query-retry.tsx").includes("router.refresh()"))
console.log("PASS: safe return context, host routing, dashboard/detail order, history separation, real retry")

assert.equal(formatSeoulDateTime(null), null)
assert.equal(formatSeoulDateTime("invalid"), null)
assert.match(formatSeoulDateTime("2026-09-22T06:00:00Z", { hour12: true })!, /오후/)
assert.match(formatSeoulDateTime("2026-09-21T23:00:00Z", { hour12: true })!, /오전/)
console.log("PASS: Seoul timezone and server/browser Korean day-period display")
