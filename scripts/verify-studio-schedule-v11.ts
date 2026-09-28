import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createWorkflowApplication } from "./fixtures/application-detail-workflow"
import { buildStudioScheduleEvents, filterStudioScheduleEvents, EMPTY_STUDIO_SCHEDULE_FILTERS } from "@/features/studio/lib/studio-schedule-events"
import { getStudioScheduleRange, isApplicationInScheduleRange } from "@/features/studio/lib/studio-schedule-range"
import { parseStudioScheduleUrlState, buildStudioScheduleQuery } from "@/features/studio/lib/studio-schedule-url-state"
import { buildScheduleOccurrenceReservationKey as key } from "@/shared/lib/schedule-reservation-key"
import { resolveStudioDetailReturn } from "@/features/studio/lib/studio-detail-navigation"

const now = new Date("2026-09-01T00:00:00Z")
const base = createWorkflowApplication({ assignedTeacherId: null, assignedTeacherName: null })
const items = [
  { ...base, id: "new", status: "new" as const },
  { ...base, id: "confirmed", status: "confirmed" as const },
  { ...base, id: "completed" },
  { ...base, id: "canceled", status: "canceled" as const },
  { ...base, id: "no-show", status: "canceled" as const, noShowAt: base.updatedAt },
  { ...base, id: "uncertain", status: "canceled" as const, confirmedSlotAt: null, confirmedBlockStartAt: null, canceledAt: base.updatedAt },
  { ...base, id: "undated", status: "canceled" as const, confirmedSlotAt: null, confirmedBlockStartAt: null }
]
const events = buildStudioScheduleEvents(items, now)
assert.equal(events.length, 7)
assert.equal(events.find(e => e.id === "new")!.scheduleLabel, "희망 일정 · 확정 필요")
assert.equal(events.find(e => e.id === "confirmed")!.statusLabel, "예약 확정")
assert.equal(events.find(e => e.id === "no-show")!.scheduleKind, "no_show")
assert.equal(events.find(e => e.id === "canceled")!.tone, "gray")
assert.ok(events.every(e => e.assignedTeacherId === null))
assert.equal(events.find(e => e.id === "uncertain")!.isDateUncertain, true)
assert.equal(events.find(e => e.id === "undated")!.dateKey, "")
assert.deepEqual(filterStudioScheduleEvents(events, { ...EMPTY_STUDIO_SCHEDULE_FILTERS, status: "no_show" }).map(e=>e.id), ["no-show"])
assert.ok(!filterStudioScheduleEvents(events, { ...EMPTY_STUDIO_SCHEDULE_FILTERS, status: "canceled" }).some(e=>e.id === "no-show"))
assert.equal(key("s", "2026-09-28T10:00:00.000Z"), key("s", "2026-09-28T10:00:00+00:00"))
assert.notEqual(key("s", "2026-09-28T10:00:00Z"), key("s", "2026-10-05T10:00:00Z"))
assert.notEqual(key("s", "2026-09-28T10:00:00Z"), key("other", "2026-09-28T10:00:00Z"))
assert.throws(() => key("s", "2026-09-28T10:00:00"))
assert.deepEqual(getStudioScheduleRange("day", "2026-09-28"), { from: "2026-09-27T15:00:00.000Z", to: "2026-09-28T15:00:00.000Z" })
assert.deepEqual(getStudioScheduleRange("week", "2026-09-28"), { from: "2026-09-26T15:00:00.000Z", to: "2026-10-03T15:00:00.000Z" })
const month = getStudioScheduleRange("month", "2026-09-28")
assert.equal(month.from, "2026-08-29T15:00:00.000Z")
assert.equal(parseStudioScheduleUrlState({date:"2026-02-31"}).dateKey, null)
for (const view of ["day", "week", "month"] as const) {
  const query = buildStudioScheduleQuery({view,dateKey:"2026-09-28",filters:{teacherId:"unassigned",classId:"class",status:"no_show"}})
  const parsed = parseStudioScheduleUrlState(Object.fromEntries(new URLSearchParams(query)))
  assert.equal(parsed.view, view); assert.equal(parsed.status,"no_show")
  assert.equal(new URLSearchParams(resolveStudioDetailReturn(`/studio/schedule${query}`).search).get("classId"),"class")
}
const day = getStudioScheduleRange("day", "2026-09-28")
assert.equal(isApplicationInScheduleRange({ ...base, confirmedSlotAt: day.to }, day), false)
assert.equal(isApplicationInScheduleRange({ ...base, confirmedSlotAt: day.from }, day), true)
const panel = readFileSync("src/features/studio/ui/studio-schedule-day-panel.tsx", "utf8")
assert.ok(panel.includes("!item.hasApplicationHistory"))
assert.ok(panel.includes("item.capacity <= item.minimumCapacity"))
assert.ok(panel.includes('"정원 마감"'))
const manager = readFileSync("src/features/studio/ui/studio-schedule-manager.tsx", "utf8")
assert.ok(manager.includes("router.push(url")); assert.ok(!manager.includes("history.pushState"))
assert.ok(manager.includes('error ? null : view === "month"'))
console.log("PASS Schedule V1.1 A–J: state/date evidence, no guessed canceled visits, Seoul ranges, canonical occurrence identity, filters/returnTo, delete/capacity UI guards, query error separation")
