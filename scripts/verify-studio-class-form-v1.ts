import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { classScheduleSnapshot, resolveClassFormScheduleSave } from "../src/features/studio/lib/class-form-schedule-save"
import { applyOperatingDraftToScheduleSlots, createDefaultCreateClassScheduleDraft, buildCreateClassScheduleDraftSlots, resolveOperationEndDate } from "../src/features/studio/lib/studio-operating-hours"
import type { StudioClassScheduleItem } from "../src/shared/lib/db/adapter"

const base: StudioClassScheduleItem = {
  id: "10000000-0000-4000-8000-000000000001", scheduleType: "one_time", bookingStatus: "open",
  dayOfWeek: null, specificDate: "2026-10-05", seriesId: "10000000-0000-4000-8000-000000000002",
  startTime: "14:00", endTime: "15:00", capacity: 3, displayLabel: null, sortOrder: 0,
  applicationCount: 0, isReferencedByApplications: false
}
const baseline = classScheduleSnapshot([base])
const submitted = [{ ...base }]
for (const [name, latest] of [
  ["add", [base, { ...base, id: "new", startTime: "16:00", endTime: "17:00" }]],
  ["delete", []],
  ["capacity", [{ ...base, capacity: 7 }]],
  ["close", [{ ...base, bookingStatus: "closed" as const }]],
  ["reopen", [{ ...base, bookingStatus: "open" as const }]],
  ["hidden", [{ ...base, bookingStatus: "hidden" as const }]]
] as const) {
  const result = resolveClassFormScheduleSave("preserve", baseline, submitted, [...latest])
  assert.equal(result.ok, true)
  if (!result.ok) throw new Error(name)
  assert.deepEqual(result.slots.map(s => [s.id, s.capacity, s.bookingStatus]), latest.map(s => [s.id, s.capacity, s.bookingStatus]))
}
assert.equal(resolveClassFormScheduleSave("replace", baseline, submitted, [{ ...base, capacity: 7 }]).ok, false)
assert.equal(resolveClassFormScheduleSave("replace", baseline, submitted, [{ ...base, isReferencedByApplications: true }]).ok, false)
assert.equal(resolveClassFormScheduleSave("replace", baseline, submitted, [base]).ok, true)
assert.equal(classScheduleSnapshot([base]), classScheduleSnapshot([{ ...base, startTime: "14:00:00", endTime: "15:00:00" }]))

const draft = { ...createDefaultCreateClassScheduleDraft(), operationStartDate: "2026-10-05", operationEndDate: "2026-10-05", defaultCapacity: "35",
  groups: [{ id: base.seriesId!, weekdays: [1], timeRanges: [{ id: "range", startTime: "14:00", lastStartTime: "16:00", capacity: "35" }] }] }
const protectedSlot = { localId: "protected", persistedId: base.id, scheduleType: "one_time" as const, bookingStatus: "closed" as const,
  dayOfWeek: "", specificDate: "2026-10-05", seriesId: base.seriesId!, startTime: "14:00", endTime: "15:00", capacity: "3", displayLabel: "기존",
  applicationCount: 1, isReferencedByApplications: true }
const weekly = { ...protectedSlot, localId: "weekly", persistedId: "weekly", scheduleType: "weekly" as const, dayOfWeek: "1", specificDate: "", seriesId: "" }
const next = applyOperatingDraftToScheduleSlots([protectedSlot, weekly], draft, "2026-10-01")
assert.deepEqual(next.find(s => s.persistedId === base.id), protectedSlot)
assert.deepEqual(next.find(s => s.persistedId === "weekly"), weekly)
assert.equal(next.filter(s => s.specificDate === "2026-10-05" && s.startTime === "14:00").length, 1)
assert.equal(next.find(s => s.startTime === "15:00")?.capacity, "35")
assert.equal(buildCreateClassScheduleDraftSlots(draft).length, 3)
assert.equal(resolveOperationEndDate({ ...draft, isAlwaysOpen: true }), "2027-01-02")

const form = readFileSync("src/features/studio/ui/studio-class-form.tsx", "utf8")
const route = readFileSync("app/studio/(dashboard)/classes/new/page.tsx", "utf8")
assert.ok(route.includes("StudioClassForm"))
assert.ok(!form.includes("activeTab"))
assert.ok(!form.includes("maxLength={60}"))
assert.ok(form.includes('name="scheduleWriteMode"'))
assert.ok(form.includes('value={mode === "create" ? "true" : "false"}'))
console.log("PASS: Class Form V1 immediate schedule add/delete/capacity/status preservation; concurrent edit guard; protected/weekly identity; 90-day generation; common route and preserved public guard policy")
