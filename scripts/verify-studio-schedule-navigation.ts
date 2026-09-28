import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { shiftMonthKey, shiftDateKey, getSeoulTodayKey } from "@/features/studio/lib/studio-schedule-month"
import { getStudioScheduleRange } from "@/features/studio/lib/studio-schedule-range"
import { buildStudioScheduleQuery, parseStudioScheduleUrlState } from "@/features/studio/lib/studio-schedule-url-state"
import { resolveStudioDetailReturn } from "@/features/studio/lib/studio-detail-navigation"

// Existing month helper deliberately selects day 1 (including short/leap months).
for (const [from, delta, expected] of [
  ["2026-09-28", 1, "2026-10-01"], ["2026-10-01", 1, "2026-11-01"],
  ["2026-11-01", -1, "2026-10-01"], ["2026-12-31", 1, "2027-01-01"],
  ["2027-01-01", -1, "2026-12-01"], ["2026-01-31", 1, "2026-02-01"],
  ["2028-01-31", 1, "2028-02-01"], ["2028-02-29", 1, "2028-03-01"]
] as const) assert.equal(shiftMonthKey(from, delta), expected)
assert.equal(shiftDateKey("2026-09-28", -1), "2026-09-27")
assert.equal(shiftDateKey("2026-09-28", 1), "2026-09-29")
assert.equal(shiftDateKey("2026-09-28", -7), "2026-09-21")
assert.equal(shiftDateKey("2026-09-28", 7), "2026-10-05")
assert.equal(getSeoulTodayKey(new Date("2026-09-28T15:00:00Z")), "2026-09-29")
const filters = { teacherId: "teacher-1", classId: "class-1", status: "confirmed" as const }
for (const view of ["month", "week", "day"] as const) {
  const dateKey = view === "month" ? shiftMonthKey("2026-09-28", 1) : shiftDateKey("2026-09-28", view === "week" ? 7 : 1)
  const query = buildStudioScheduleQuery({ view, dateKey, filters })
  const restored = parseStudioScheduleUrlState(Object.fromEntries(new URLSearchParams(resolveStudioDetailReturn(`/studio/schedule${query}`).search)))
  assert.deepEqual(restored, { view, dateKey, ...filters })
  assert.notDeepEqual(getStudioScheduleRange(view, dateKey), getStudioScheduleRange(view, "2026-09-28"))
  const todayQuery = buildStudioScheduleQuery({ view, dateKey: "2026-09-28", filters })
  assert.deepEqual(parseStudioScheduleUrlState(Object.fromEntries(new URLSearchParams(todayQuery))), {view,dateKey:"2026-09-28",...filters})
}
const october = getStudioScheduleRange("month", "2026-10-01")
assert.equal(october.from, "2026-09-26T15:00:00.000Z")
assert.equal(october.to, "2026-10-31T15:00:00.000Z")
const leap = getStudioScheduleRange("month", "2028-02-01")
assert.ok(Date.parse(leap.from) <= Date.parse("2028-02-29T00:00:00+09:00"))
assert.ok(Date.parse(leap.to) > Date.parse("2028-02-29T23:59:00+09:00"))
const manager = readFileSync("src/features/studio/ui/studio-schedule-manager.tsx", "utf8")
assert.ok(manager.includes("const miniMonthKey = toMonthStartKey(anchorDateKey)"))
assert.ok(!manager.includes("setMiniMonthKey"))
assert.ok(manager.includes("applyNavigation({ dateKey: shiftMonthKey(miniMonthKey, offset) })"))
assert.ok(manager.includes("router.push(url, { scroll: false })"))
const header = manager.slice(manager.indexOf('<header className={styles.canvasHeader}>'), manager.indexOf('{alerts.needsReview'))
assert.ok(header.indexOf("movePeriod(-1)") < header.indexOf("{periodLabel}"))
assert.ok(header.indexOf("{periodLabel}") < header.indexOf("movePeriod(1)"))
assert.ok(header.includes("getSeoulTodayKey()"))
console.log("PASS: month/year/short-month/leap navigation, day/week increments, Seoul today, URL filters + detail return, leading/trailing range refresh, shared mini/main anchor, arrow-label order")
