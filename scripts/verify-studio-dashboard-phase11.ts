// Pure behavior checks. No remote reads, writes, or notification sends.
import assert from "node:assert/strict"
import { buildStudioDashboardMetrics } from "@/features/studio/lib/studio-dashboard-metrics"
import { buildStudioDashboardAnalytics } from "@/features/studio/lib/studio-dashboard-analytics"
import { buildStudioDashboardView } from "@/features/studio/lib/studio-dashboard-view"
import { buildStudioDateRangeFromPreset, resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getCaseDisplayStage } from "@/features/studio/lib/case-view-model"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

const now = new Date("2026-09-22T06:00:00Z")
const range = resolveStudioDateRange({ startDate: "2026-09-01", endDate: "2026-09-30" })
const base: StudioApplicationSummary = {
  id: "base", classId: "class", classTitle: "피아노", classProgramType: "trial_class",
  academyName: "테스트 학원", teacherDisplayName: "선생님", organizationAddress: null, organizationAddressDetail: null, parentId: null, requestedScheduleBlockId: null, classAssignmentMode: "post_assign",
  childName: "테스트 학생", childGrade: "초4", parentName: null, parentPhone: null,
  requestedSlotAt: "2026-09-22T06:00:00Z", confirmedSlotAt: null,
  status: "new", goalType: null, createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-21T00:00:00Z",
  classSubject: "피아노", classRegion: null, scheduleStartTime: "15:00", scheduleEndTime: "16:00",
  confirmedBlockStartAt: null, confirmedBlockEndAt: null, assignedTeacherId: "teacher", assignedTeacherName: "선생님",
  contactedAt: null, scheduledAt: null, completedAt: null, canceledAt: null, noShowAt: null,
  enrolledAt: null, lostAt: null, registrationStatus: "undecided", unregisteredReason: null
}
const rows: StudioApplicationSummary[] = [
  { ...base, id: "new" },
  { ...base, id: "reviewing", status: "reviewing" },
  { ...base, id: "in-trial", status: "confirmed", confirmedSlotAt: base.requestedSlotAt },
  { ...base, id: "enrolled", status: "completed", registrationStatus: "enrolled", enrolledAt: "2026-09-20T10:00:00Z" },
  { ...base, id: "lost", status: "completed", registrationStatus: "not_enrolled", lostAt: "2026-09-21T10:00:00Z" },
  { ...base, id: "pending", status: "completed", registrationStatus: "pending" },
  { ...base, id: "cancel", status: "canceled" },
  { ...base, id: "no-show", status: "canceled", noShowAt: now.toISOString() },
  { ...base, id: "old-action", createdAt: "2026-08-01T00:00:00Z" }
]
const metrics = buildStudioDashboardMetrics(rows, range)
assert.deepEqual(metrics.steps.map(step => step.count), [8, 5, 4, 3, 1])
assert.deepEqual(metrics.trialOutcomes, { completed: 3, noShow: 1, canceled: 1, pending: 3 })
assert.equal(metrics.registrationConversionRate, 50)
const analytics = buildStudioDashboardAnalytics(metrics)
assert.equal(analytics.donutTotal, 3)
assert.deepEqual(analytics.donutSegments.map(segment => segment.count), [1, 1, 1])
const view = buildStudioDashboardView(rows, now)
assert.ok(view.actionItems.some(item => item.id === "old-action"))
assert.equal(view.scheduleItems[0].studentGrade, "초4")
assert.deepEqual(view.recentRegistrationItems.map(item => item.id), ["lost", "enrolled"])
assert.equal(buildStudioDashboardView([{ ...rows[4], lostAt: null }], now).recentRegistrationItems.length, 0)
const empty = buildStudioDashboardAnalytics(buildStudioDashboardMetrics([], range))
assert.equal(empty.donutTotal, 0)
assert.equal(empty.conversionValue, "—")
assert.ok(empty.donutSegments.every(segment => Number.isFinite(segment.dashLength)))
assert.deepEqual(buildStudioDateRangeFromPreset("last3Months", now), { startDate: "2026-07-01", endDate: "2026-09-22" })
assert.deepEqual(buildStudioDateRangeFromPreset("thisYear", new Date("2026-12-31T15:00:00Z")), { startDate: "2027-01-01", endDate: "2027-01-01" })
assert.deepEqual(buildStudioDateRangeFromPreset("last3Months", new Date("2026-01-01T00:00:00Z")), { startDate: "2025-11-01", endDate: "2026-01-01" })
for (const [input, expected] of [
  [{ ...base, status: "confirmed", confirmedSlotAt: "2026-09-22T06:00:01Z" }, "confirmed"],
  [rows[2], "in_trial"],
  [rows[5], "completed"],
  [rows[6], "canceled"],
  [rows[7], "no_show"]
] as const) assert.equal(getCaseDisplayStage(input, now), expected)
console.log("PASS: unchanged funnel and denominators, no-show partition, period-independent work, real result dates, empty data, KST presets, five lifecycle states")
