import assert from "node:assert/strict"
import { normalizeOperatingTimeInput as normalize, operatingTimeOptions } from "../src/features/studio/lib/operating-time-input"
import { classOperatingRuleFromDraft } from "../src/features/studio/lib/class-operating-rule"
import { createDefaultCreateClassScheduleDraft, validateOperatingScheduleDraft } from "../src/features/studio/lib/studio-operating-hours"

for (const [raw, expected] of [["9", "09:00"], ["930", "09:30"], ["1430", "14:30"], ["9:10", "09:10"], ["０９：１０", "09:10"], ["23:59", "23:59"], ["", ""]]) assert.equal(normalize(raw), expected)
for (const raw of ["24:00", "25:00", "12:60", "14:3", "abcd", "-1:00", "12345"]) assert.equal(normalize(raw), null)
const options = operatingTimeOptions("09:10")
assert(options.includes("09:10")); assert.equal(options[0], "00:00"); assert.equal(options.at(-1), "23:30")
assert.equal(operatingTimeOptions("09:30").length, 48)
const draft = { ...createDefaultCreateClassScheduleDraft(), isAlwaysOpen: true, operationStartDate: "2026-10-13", defaultCapacity: "1", groups: [{ id: "1a52d6e0-8150-440a-96ef-3b957fca566b", weekdays: [2], timeRanges: [{ id: "row", startTime: normalize("1410")!, operationEndTime: normalize("1610")!, lastStartTime: "", capacity: "1" }] }] }
assert.equal(validateOperatingScheduleDraft(draft), null)
assert.deepEqual(classOperatingRuleFromDraft(draft).slots.map(s => [s.startTime, s.endTime]), [["14:10", "15:10"], ["15:10", "16:10"]])
for (const end of ["14:00", "14:10", "25:00"]) assert.equal(validateOperatingScheduleDraft({ ...draft, groups: draft.groups.map(g => ({ ...g, timeRanges: g.timeRanges.map(r => ({ ...r, operationEndTime: end })) })) }), "time")
console.log("PASS direct time normalization, invalid input, custom-minute preservation, canonical operating-rule payload and end-time restrictions")
