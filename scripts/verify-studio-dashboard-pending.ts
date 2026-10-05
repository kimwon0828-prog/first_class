// Pure fixtures and in-memory adapter only. No auth, network, DB writes or notifications.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createWorkflowApplication } from "./fixtures/application-detail-workflow"
import { buildStudioDashboardView, STUDIO_DASHBOARD_SECTION_LIMIT } from "@/features/studio/lib/studio-dashboard-view"
import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"

const now = new Date("2026-10-05T03:00:00Z")
const pending = createWorkflowApplication({
  id: "future-new", status: "new", createdAt: "2026-10-05T00:00:00Z",
  requestedSlotAt: "2026-10-12T06:00:00Z", confirmedSlotAt: null,
  confirmedBlockStartAt: null, confirmedBlockEndAt: null, completedAt: null,
  assignedTeacherId: null, registrationStatus: "undecided"
})
const older = { ...pending, id: "older-reviewing", status: "reviewing" as const, createdAt: "2026-09-01T00:00:00Z", assignedTeacherId: "teacher" }
const followups = Array.from({ length: 6 }, (_, i) => ({
  ...pending, id: `followup-${i}`, status: "completed" as const,
  createdAt: `2026-09-${20 - i}T00:00:00Z`, completedAt: "2026-09-25T06:00:00Z",
  registrationStatus: "pending" as const
}))

// Regression: a full preview of completed followups used to hide even the latest new application.
const view = buildStudioDashboardView([...followups, pending, older], now)
assert.deepEqual(view.actionItems.map(item => item.id), [pending.id, older.id, "followup-0", "followup-1", "followup-2"])
assert.equal(view.actionTotalCount, 8)
assert.equal(view.actionItems.length, STUDIO_DASHBOARD_SECTION_LIMIT)
assert.equal(view.actionItems[0].href, `/studio/applications/${pending.id}`)
assert.equal(view.actionItems[0].kind, "CONFIRM_SCHEDULE")

// Receipt date, requested visit date, teacher assignment and KST midnight do not remove pending work.
for (const at of ["2026-10-04T14:59:59Z", "2026-10-04T15:00:00Z", "2026-10-05T15:00:00Z"]) {
  for (const requestedSlotAt of ["2026-10-12T06:00:00Z", "2026-09-01T06:00:00Z"]) {
    const result = buildStudioDashboardView([{ ...pending, requestedSlotAt }, older, ...followups], new Date(at))
    assert.deepEqual(result.actionItems.map(item => item.id), view.actionItems.map(item => item.id))
    assert.equal(result.actionTotalCount, view.actionTotalCount)
  }
}

// A fresh server read after confirmation removes the schedule task from both count and preview.
const confirmed = { ...pending, status: "confirmed" as const, confirmedSlotAt: pending.requestedSlotAt }
const refreshed = buildStudioDashboardView([...followups, confirmed, older], now)
assert.equal(refreshed.actionTotalCount, 7)
assert.ok(!refreshed.actionItems.some(item => item.id === pending.id))
assert.equal(refreshed.actionItems[0].id, older.id)
assert.equal(buildStudioDashboardView([pending, older], now).actionTotalCount, 2)
assert.equal(buildStudioDashboardView([], now).actionTotalCount, 0)
for (const closed of [
  { ...pending, status: "canceled" as const },
  { ...pending, status: "canceled" as const, noShowAt: now.toISOString() },
  { ...pending, status: "completed" as const, registrationStatus: "enrolled" as const },
  { ...pending, status: "completed" as const, registrationStatus: "not_enrolled" as const }
]) assert.equal(buildStudioDashboardView([closed], now).actionTotalCount, 0)

// Preserve existing completion/followup work and both other dashboard panels.
const started = { ...confirmed, id: "started", confirmedSlotAt: "2026-10-05T01:00:00Z" }
assert.equal(buildStudioDashboardView([started, pending], now).actionItems[0].kind, "NEEDS_COMPLETION")
const registered = { ...followups[0], registrationStatus: "enrolled" as const, enrolledAt: "2026-10-04T06:00:00Z" }
const otherWork = [confirmed, registered, ...followups]
const before = buildStudioDashboardView(otherWork, now)
const after = buildStudioDashboardView([...otherWork, { ...pending, id: "additional-new" }], now)
assert.deepEqual(after.scheduleItems, before.scheduleItems)
assert.equal(after.todayScheduleCount, before.todayScheduleCount)
assert.deepEqual(after.recentRegistrationItems, before.recentRegistrationItems)
assert.deepEqual(buildStudioDashboardView(followups, now).actionItems.map(item => item.id), followups.slice(0, 5).map(item => item.id))

const page = readFileSync("app/studio/(dashboard)/page.tsx", "utf8")
assert.ok(page.includes("getStudioApplications(teacher.organizationId)"))
assert.ok(page.includes("view.actionTotalCount > view.actionItems.length"))
assert.ok(page.includes("전체 {view.actionTotalCount}건 중 {view.actionItems.length}건 미리보기"))

async function verifyOrganizationBoundary() {
  assert.deepEqual(await mockDataAdapter.listStudioApplications("other-organization"), [])
  console.log("PASS: pending work ahead of full followup preview, total/preview counts, future/old receipts, KST boundaries, status refresh, detail href, closed exclusions, mock org boundary, other panels unchanged")
}
void verifyOrganizationBoundary()
