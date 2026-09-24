// Pure presentation checks: no DB, network or workflow writes.
import assert from "node:assert/strict"
import {
  getCaseContactPresentation,
  getCaseListActionLabel,
  getCaseTrialScheduleLabel,
  getCaseLatestRecord
} from "@/features/studio/lib/case-list-presentation"
import { getCaseNextAction, type CaseAttentionInput, type StudioCaseListItem } from "@/features/studio/lib/case-view-model"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"

const now = new Date("2026-09-22T03:00:00Z") // Seoul noon
const contact = (nextContactAt: string | null, status = "completed" as StudioCaseListItem["status"], stage = "completed" as StudioCaseListItem["stage"]) =>
  getCaseContactPresentation({ nextContactAt, status, stage }, now)
assert.deepEqual(contact("2026-09-21T06:00:00Z"), { label: "연락 지연 · 9/21 15:00", tone: "danger" })
assert.deepEqual(contact("2026-09-22T06:00:00Z"), { label: "오늘 연락 · 15:00", tone: "warning" })
assert.deepEqual(contact("2026-09-22T01:00:00Z"), { label: "오늘 연락 · 10:00 경과", tone: "warning" })
assert.deepEqual(contact("2026-09-22T03:00:00Z"), { label: "오늘 연락 · 12:00", tone: "warning" })
assert.deepEqual(contact("2026-09-23T06:00:00Z"), { label: "연락 예정 · 9/23 15:00", tone: "default" })
// UTC yesterday is Seoul today; year and midnight boundaries must use Seoul dates.
assert.equal(contact("2026-09-21T15:00:00Z")?.label, "오늘 연락 · 00:00 경과")
assert.equal(getCaseContactPresentation({ stage: "completed", status: "completed", nextContactAt: "2026-12-31T15:00:00Z" }, new Date("2026-12-31T14:59:00Z"))?.label, "연락 예정 · 1/1 00:00")
assert.equal(contact("invalid"), null)
assert.deepEqual(contact(null), { label: "다음 연락 미정", tone: "default" })
for (const stage of ["new", "reviewing", "confirmed"] as const) assert.equal(contact(null, stage, stage), null)
for (const stage of ["enrolled", "not_enrolled", "canceled", "no_show"] as const) assert.equal(contact("2026-09-21T06:00:00Z", stage === "canceled" || stage === "no_show" ? "canceled" : "completed", stage), null)

const attention: CaseAttentionInput = {
  status: "completed", registrationStatus: "pending", noShowAt: null, assignedTeacherId: null,
  requestedSlotAt: "2026-09-20T06:00:00Z", confirmedSlotAt: "2026-09-20T06:00:00Z",
  confirmedBlockStartAt: null, confirmedBlockEndAt: null,
  scheduleStartTime: null, scheduleEndTime: null, trialResultExists: true,
  hasAnyConsultationHistory: true, nextContactAt: "2026-09-21T06:00:00Z"
}
const nextAction = getCaseNextAction(attention, now)
assert.equal(nextAction.key, "UNASSIGNED")
assert.equal(getCaseListActionLabel({ ...attention, nextAction }), "담당자 배정")
assert.equal(contact(attention.nextContactAt)?.tone, "danger")
assert.equal(getCaseNextAction({ ...attention, assignedTeacherId: "teacher" }, now).key, "OVERDUE_CONTACT")
assert.equal(getChildGradeLabel("elem_3"), "초3")
const item = {
  stage: "completed", status: "completed", requestedSlotAt: "2026-09-24T06:00:00Z",
  confirmedSlotAt: "2026-09-25T08:00:00Z", createdAt: "2026-09-18T00:00:00Z",
  completedAt: "2026-09-20T07:00:00Z", latestConsultation: { occurredAt: "2026-09-21T01:00:00Z" },
  lastActivityAt: "2026-09-22T03:00:00Z"
} as StudioCaseListItem
assert.equal(getCaseTrialScheduleLabel(item), "9/25 (금) 17:00 · 확정")
assert.equal(getCaseTrialScheduleLabel({ ...item, confirmedSlotAt: null }), "9/24 (목) 15:00 · 희망")
assert.equal(getCaseLatestRecord(item)?.label, "상담 기록")
assert.equal(getCaseLatestRecord(item)?.dateLabel, "9월 21일")
console.log("PASS: Cases V1 Seoul contact boundaries, nullable/closed states, unassigned coexistence, unchanged workflow, grade, schedule and actual record labels")
