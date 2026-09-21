import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { withRecordChild } from "@/features/record/lib/record-href"
import { resolveSelectedChildId } from "@/features/children/lib/child-selection"
import { selectCompletedExperiences } from "@/features/applications/lib/parent-application-split"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
const read = (p: string) => readFileSync(p, "utf8")
const owned = [{ id: "c1" }, { id: "c2" }]
assert.equal(resolveSelectedChildId("foreign", owned), null)
for (const id of [null, "c1", "c2", "id + / ? &"]) {
  for (const path of ["/record", "/record/a", "/record/a/report", "/record/profile", "/classes"]) {
    const url = new URL(withRecordChild(path, id), "https://firstsuup.com")
    assert.equal(url.pathname, path)
    assert.equal(url.searchParams.get("child"), id)
  }
}
assert.equal(withRecordChild("/record?existing=yes&child=old", "c1"), "/record?existing=yes&child=c1")
const fixture = (id: string, childId: string | null, status: ParentApplicationSummary["status"]) => ({ id, childId, status, childName: "같은 이름", completedAt: "2026-09-21T00:00:00Z" }) as ParentApplicationSummary
const rows = [fixture("a","c1","completed"),fixture("b","c2","completed"),fixture("legacy",null,"completed"),fixture("cancel","c1","canceled"),fixture("next","c1","confirmed")]
const completed = selectCompletedExperiences(rows)
assert.equal(completed.length, 3)
assert.deepEqual(completed.filter(x => x.childId === "c1").map(x => x.id), ["a"])
assert.deepEqual(completed.filter(x => x.childId === "c2").map(x => x.id), ["b"])
assert.equal(selectCompletedExperiences([]).length, 0)
const home = read("src/features/record/ui/record-home.tsx")
const page = read("app/record/page.tsx")
assert.ok(home.includes('unselectedLabel="모든 아이"') && home.includes('allChildrenLabel="모든 아이"'))
assert.ok(home.includes('contextStyles.childSelector') && home.includes('manageSheetFocus'))
assert.ok(page.includes('children.error ? "children" : applications.error ? "records"'))
assert.ok(page.includes('<Suspense fallback={<RecordSkeleton />}'))
assert.ok(home.includes('buildClassesHref({ child: selectedChildId })'))
assert.ok(read("src/features/record/ui/record-retry.tsx").includes('router.refresh()'))
assert.ok(read("src/features/record/queries/get-parent-experience-signals.ts").includes('if (children.error) throw'))
assert.ok(read("src/features/record/queries/get-record-child-context.ts").includes('resolveSelectedChildId(value, children.data)'))
for (const p of ['app/record/[experienceId]/page.tsx','app/record/[experienceId]/report/page.tsx']) {
  const source = read(p)
  assert.ok(source.includes('getRecordChildContext((await searchParams)?.child)') || (source.includes('const childQuery = (await searchParams)?.child') && source.includes('getRecordChildContext(childQuery)')))
  assert.ok(source.includes('withRecordChild('))
}
assert.ok(read('app/record/profile/page.tsx').includes('withRecordChild(`/record/${source.experienceId}/report`, childId)'))
console.log('ALL PASS — Record V1: owned child, encoded canonical links, legacy identity, completed-only, states, context propagation')
