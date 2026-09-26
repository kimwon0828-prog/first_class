import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

import {
  classOperatingRuleFromDraft,
  classOperatingRuleToDraft,
  type ClassOperatingRule
} from "../src/features/studio/lib/class-operating-rule"
import {
  buildOperatingTimeRangeSlots,
  createDefaultCreateClassScheduleDraft,
  normalizeStoredScheduleDraft,
  validateOperatingScheduleDraft,
  type CreateClassScheduleDraft
} from "../src/features/studio/lib/studio-operating-hours"
import { presentOperatingDraftGroups } from "../src/features/studio/lib/class-operation-presentation"

const groupA = "10000000-0000-4000-8000-000000000001"
const groupB = "10000000-0000-4000-8000-000000000002"
const base = createDefaultCreateClassScheduleDraft()
const rangeDraft: CreateClassScheduleDraft = {
  ...base,
  operationStartDate: "2026-09-25",
  isAlwaysOpen: true,
  intervalMinutes: "60",
  timeInputMode: "range",
  usePerTimeRangeCapacity: true,
  groups: [{ id: groupA, weekdays: [1, 3, 5], timeRanges: [{
    id: "range-a", startTime: "13:00", operationEndTime: "20:00", lastStartTime: "", capacity: "4"
  }] }]
}

const preview = buildOperatingTimeRangeSlots(rangeDraft.groups[0].timeRanges[0], 60, "range")
assert.deepEqual(preview.map((slot) => slot.startTime), ["13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"])
const payload = classOperatingRuleFromDraft(rangeDraft)
assert.equal(payload.slots.length, 21)
assert.deepEqual(payload.slots.filter((slot) => slot.weekday === 1).map((slot) => [slot.startTime, slot.endTime]),
  preview.map((slot) => [slot.startTime, slot.endTime]))
assert.equal(validateOperatingScheduleDraft(rangeDraft), null)
assert.deepEqual(
  presentOperatingDraftGroups({
    ...rangeDraft,
    groups: [{ ...rangeDraft.groups[0], weekdays: [2, 3, 4, 5, 6], timeRanges: [{
      ...rangeDraft.groups[0].timeRanges[0], startTime: "11:00", operationEndTime: "20:00"
    }] }]
  }),
  [{ id: groupA, weekdayLabel: "화·수·목·금·토", timeLabel: "11:00 ~ 20:00" }]
)

const breakDraft: CreateClassScheduleDraft = { ...rangeDraft, groups: [{ id: groupA, weekdays: [1, 3], timeRanges: [
  { id: "early", startTime: "13:00", operationEndTime: "17:00", lastStartTime: "", capacity: "4" },
  { id: "late", startTime: "18:00", operationEndTime: "20:00", lastStartTime: "", capacity: "4" }
] }] }
assert.equal(classOperatingRuleFromDraft(breakDraft).slots.length, 12)
assert.equal(validateOperatingScheduleDraft(breakDraft), null)

const multipleGroups: CreateClassScheduleDraft = { ...rangeDraft, groups: [
  { id: groupA, weekdays: [1, 3], timeRanges: [{ id: "a", startTime: "13:00", operationEndTime: "20:00", lastStartTime: "", capacity: "4" }] },
  { id: groupB, weekdays: [2, 4], timeRanges: [{ id: "b", startTime: "15:00", operationEndTime: "19:00", lastStartTime: "", capacity: "3" }] }
] }
assert.equal(classOperatingRuleFromDraft(multipleGroups).slots.length, 22)
assert.equal(validateOperatingScheduleDraft(multipleGroups), null)
assert.equal(validateOperatingScheduleDraft({ ...multipleGroups,
  groups: [multipleGroups.groups[0], { ...multipleGroups.groups[1], weekdays: [1, 4] }] }), "duplicate_weekday")
assert.equal(validateOperatingScheduleDraft({ ...rangeDraft, groups: [{ ...rangeDraft.groups[0], timeRanges: [
  { id: "a", startTime: "13:00", operationEndTime: "17:00", lastStartTime: "", capacity: "4" },
  { id: "b", startTime: "16:00", operationEndTime: "20:00", lastStartTime: "", capacity: "4" }
] }] }), "overlapping_range")

const fixedPayload = classOperatingRuleFromDraft({ ...rangeDraft, isAlwaysOpen: false,
  operationStartDate: "2026-10-01", operationEndDate: "2026-11-30" })
assert.equal(fixedPayload.operationType, "fixed_period")
assert.equal(fixedPayload.endDate, "2026-11-30")

const makeRule = (slots: ClassOperatingRule["slots"]): ClassOperatingRule => ({
  id: "20000000-0000-4000-8000-000000000001", operationType: "rolling", startDate: "2026-09-25",
  endDate: null, rollingDays: 90, revision: 1, isActive: true, slots
})
const regularRule = makeRule([1, 3].flatMap((weekday) => ["13:00", "14:00", "15:00"].map((startTime) => ({
  weekday, startTime, endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, "0")}:00`, capacity: 4, seriesId: groupA
}))))
const restoredRegular = classOperatingRuleToDraft(regularRule)
assert.equal(restoredRegular.timeInputMode, "range")
assert.equal(restoredRegular.groups[0].timeRanges[0].operationEndTime, "16:00")
assert.deepEqual(classOperatingRuleFromDraft(restoredRegular).slots, regularRule.slots)

const irregularRule = makeRule(["13:00", "14:30", "17:00"].map((startTime) => {
  const [hour, minute] = startTime.split(":").map(Number)
  const end = hour * 60 + minute + 60
  return { weekday: 1, startTime, endTime: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    capacity: 4, seriesId: groupA }
}))
const restoredIrregular = classOperatingRuleToDraft(irregularRule)
assert.equal(restoredIrregular.timeInputMode, "individual")
assert.deepEqual(classOperatingRuleFromDraft(restoredIrregular).slots, irregularRule.slots)

const mixedCapacityRule = makeRule([
  { weekday: 1, startTime: "13:00", endTime: "14:00", capacity: 4, seriesId: groupA },
  { weekday: 1, startTime: "14:00", endTime: "15:00", capacity: 2, seriesId: groupA }
])
const restoredMixed = classOperatingRuleToDraft(mixedCapacityRule)
assert.equal(restoredMixed.timeInputMode, "individual")
assert.deepEqual(classOperatingRuleFromDraft(restoredMixed).slots, mixedCapacityRule.slots)

const oldDraft = { ...base, defaultCapacity: "4", timeInputMode: undefined, groups: [{ id: groupA, weekdays: [1], timeRanges: [
  { id: "old", startTime: "13:00", lastStartTime: "13:00", capacity: "4" }
] }] }
const normalizedOld = normalizeStoredScheduleDraft(oldDraft)
assert.equal(normalizedOld.timeInputMode, "individual")
assert.equal(classOperatingRuleFromDraft({ ...normalizedOld, operationStartDate: "2026-09-25", isAlwaysOpen: true }).slots.length, 1)

const form = readFileSync("src/features/studio/ui/studio-class-form.tsx", "utf8")
const editor = readFileSync("src/features/studio/ui/studio-class-operation-editor.tsx", "utf8")
const migration = readFileSync("supabase/migrations/20260924160000_studio_rolling_schedule_v1.sql", "utf8")
assert.ok(form.includes("앞으로의 운영 일정을 설정해 주세요."))
assert.ok(form.includes("특정 날짜만 변경하기"))
assert.ok(editor.includes("+ 시간대 추가"))
assert.ok(editor.includes("+ 운영시간 그룹 추가"))
assert.ok(editor.includes('lang="en-GB"'))
assert.ok(editor.includes("기존 개별 시간 설정"))
assert.ok(editor.includes("체험수업 시간"))
assert.ok(migration.includes("not exists(select 1 from public.class_schedule_exceptions"))
assert.ok(migration.includes("not exists(select 1 from public.trial_applications"))

console.log("PASS: range preview/payload parity, multiple ranges/groups, fixed period, regular round-trip, irregular/mixed-capacity fallback, legacy draft compatibility, and protected schedule contracts")
