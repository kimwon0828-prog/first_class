import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mockDataAdapter as mockAdapter } from "../src/shared/lib/db/mock-adapter"

async function main() {
  // Exercise the same adapter contract used by UI fixtures, rather than only inspecting source.
  const org = "org-1"
  const source = readFileSync("src/shared/lib/db/mock-adapter.ts", "utf8")
  const organization = source.match(/const mockOrganizationId = "([^"]+)"/)?.[1] ?? org
  const list = await mockAdapter.listStudioClasses(organization)
  assert.ok(list.length)
  const item = list.find(c => c.isActive)!
  const before = structuredClone(item.schedules)
  await mockAdapter.mutateStudioClassLifecycle(item.id, organization, "archive")
  assert.equal(await mockAdapter.getClassById(item.id), null)
  assert.deepEqual(await mockAdapter.listAvailableScheduleSlotsByClassId(item.id), [])
  await assert.rejects(mockAdapter.createStudioClassSchedule({ organizationId: organization, classId: item.id, teacherId: item.teacherId, specificDate: "2026-12-01", startTime: "15:00", endTime: "16:00", capacity: 3 }), /restore_required/)
  await assert.rejects(mockAdapter.updateStudioClassActive(item.id, organization, true), /restore_required/)
  await mockAdapter.mutateStudioClassLifecycle(item.id, organization, "restore")
  const restored = (await mockAdapter.listStudioClasses(organization)).find(c => c.id === item.id)!
  assert.equal(restored.isActive, false)
  assert.equal(restored.archivedAt, null)
  assert.deepEqual(restored.schedules, before)
  await mockAdapter.updateStudioClassActive(item.id, organization, true)
  assert.ok(await mockAdapter.getClassById(item.id))
  for (const path of ["src/features/classes/queries/public-class-safe-projection.ts", "src/features/academies/queries/get-public-academy-classes.ts", "src/features/academies/queries/get-academies-for-list.ts", "src/features/location/queries/get-classes-region-catalog.ts", "src/features/location/queries/get-academies-region-catalog.ts"]) {
    const code = readFileSync(path, "utf8")
    assert.equal((code.match(/\.eq\("is_active", true\)/g) ?? []).length, (code.match(/\.is\("archived_at", null\)/g) ?? []).length, path)
  }
  console.log("PASS mock lifecycle parity; public list/detail/academy/region query predicates")
}
main().catch(e => { console.error(e); process.exitCode = 1 })
