// npx tsx scripts/verify-parent-class-detail-design.ts — pure presentation/domain boundaries; no DB writes.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { formatDetailSchedule, selectEarliestDetailSlot, resolveDetailEligibility } from "@/features/classes/lib/class-detail-presentation"
import { buildPublicSlotLines } from "@/features/applications/lib/public-class-slots"
import { resolveSelectedChildId } from "@/features/children/lib/child-selection"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"

const sample: AvailableScheduleSlot = {
  id: "slot", source: "class_schedule", optionId: "option", classScheduleId: "schedule",
  scheduleBlockId: null, scheduleType: "one_time", bookingStatus: "open", teacherId: null,
  classId: "class", label: "", startAt: "2026-09-21T14:30:00Z", endAt: "2026-09-21T15:30:00Z",
  capacity: 2, appliedCount: 0, remainingCount: 2, isClosed: false
}
assert.deepEqual(formatDetailSchedule(sample), {
  dateLabel: "2026년 9월 21일 (월)", timeLabel: "오후 11:30 ~ 9월 22일 오전 12:30 · 60분"
})
assert.equal(formatDetailSchedule(undefined), null)
assert.equal(formatDetailSchedule({ ...sample, startAt: "invalid" }), null)
assert.equal(formatDetailSchedule({ ...sample, endAt: "invalid" })?.timeLabel, "오후 11:30")
assert.equal(formatDetailSchedule({ ...sample, endAt: sample.startAt })?.timeLabel, "오후 11:30")
const weekly = { ...sample, scheduleType: "weekly" as const }
const now = Date.parse("2026-09-01T00:00:00Z")
assert.equal(buildPublicSlotLines([weekly, { ...weekly, id: "second", startAt: "2026-09-28T14:30:00Z" }], now).length, 1)
assert.equal(buildPublicSlotLines([{ ...sample, isClosed: true }, { ...sample, remainingCount: 0 }], now).length, 0)
assert.ok(!formatDetailSchedule(weekly)!.timeLabel.includes("매주"))
assert.equal(resolveSelectedChildId("foreign-child", [{ id: "owned-child" }]), null)
assert.equal(resolveSelectedChildId("owned-child", [{ id: "owned-child" }]), "owned-child")
assert.equal(isChildEligibleForClass("초3", "초1~초3"), true)
assert.equal(isChildEligibleForClass("초6", "초1~초3"), false)

const read = (path: string) => readFileSync(path, "utf8")
const page = read("app/classes/[id]/page.tsx")
const info = page.slice(page.indexOf('<dl className={styles.infoGrid}>'), page.indexOf('</dl>'))
for (const duplicate of ['organizationLabel', 'administrativeRegionLabel', 'classSubjectLabel', 'targetGradeLabel', 'trialPrice']) {
  assert.ok(!info.includes(duplicate), `duplicate info row: ${duplicate}`)
}
assert.ok(page.includes('resolveDetailEligibility(children, resolvedSearchParams?.child, classItem.targetAge)'))

assert.ok(!page.includes('ParentBottomNav'))
for (const field of ['description', 'recommendedFor', 'experiencePoints', 'curriculum']) {
  assert.ok(page.includes(`classItem.${field}`), `Original ${field} retained`)
}
assert.ok(!page.includes('{error}</') && !page.includes('{slotsError}</'))
assert.ok(!page.includes('다른 일정 보기') && !page.includes('>학원 정보</h2>'))
assert.equal((page.match(/href=\{academyHref\}/g) ?? []).length, 1)
assert.ok(!page.includes('HomeChildSelector'))
assert.ok(!page.includes('신청할 자녀를 선택해주세요.'))
const listPage = read('app/classes/page.tsx')
assert.ok(listPage.includes('detailRegionQuery.set("child", selectedChildId)'))
assert.ok(listPage.includes('href={detailHrefForClass(item.id)}'))
const early = { ...sample, id: 'early', startAt: '2026-09-21T23:00:00+09:00' }
const later = { ...sample, id: 'later', startAt: '2026-09-21T14:30:00Z' }
assert.equal(selectEarliestDetailSlot([later, early], now)?.id, 'early')
assert.equal(selectEarliestDetailSlot([early, later], now)?.id, 'early')
assert.equal(selectEarliestDetailSlot([
  { ...early, isClosed: true }, { ...early, remainingCount: 0 },
  { ...early, bookingStatus: 'hidden' }, { ...early, startAt: 'invalid' },
  { ...early, startAt: new Date(now).toISOString() }, later
], now)?.id, 'later')
assert.equal(selectEarliestDetailSlot([], now), undefined)
assert.equal(selectEarliestDetailSlot([early], Date.parse(early.startAt)), undefined)
const disclosure = read('src/features/classes/ui/class-detail-disclosure.tsx')
assert.ok(disclosure.includes('aria-expanded={open}') && disclosure.includes('hidden={!open}'))
assert.ok(disclosure.includes('scrollHeight > element.clientHeight'))
const sheet = read('src/features/applications/ui/class-detail-application-sheet.tsx')
assert.ok(!sheet.includes('onClick={closeSheet} aria-hidden="true"'))
assert.ok(sheet.includes('const canFinalSubmit = hasSession && isParentUser && canSubmit && requiredAgreementsChecked'))
console.log('PASS: detail schedule/KST/ownership/eligibility, information preservation, disclosure and application boundaries')

const owned = [{ id: "a", name: "유미", grade: "초3" }, { id: "b", name: "지우", grade: "초1" }, { id: "c", name: "민수", grade: "초6" }]
assert.deepEqual(resolveDetailEligibility(owned, "c", "초1~초3"), { kind: "single", child: owned[2], eligible: false })
assert.deepEqual(resolveDetailEligibility(owned, "a", "초1~초3"), { kind: "single", child: owned[0], eligible: true })
assert.deepEqual(resolveDetailEligibility(owned, undefined, "초3"), { kind: "single", child: owned[0], eligible: true })
assert.deepEqual(resolveDetailEligibility(owned, undefined, "초1~초3"), { kind: "multiple", children: owned.slice(0, 2) })
assert.deepEqual(resolveDetailEligibility(owned, undefined, "중1"), { kind: "none" })
assert.deepEqual(resolveDetailEligibility([], undefined, "초1~초3"), { kind: "hidden" })
assert.deepEqual(resolveDetailEligibility(owned, "foreign", "초1~초3"), { kind: "hidden" })
console.log("PASS: query priority, owned child, single/multiple/zero eligible, no children, foreign query")
