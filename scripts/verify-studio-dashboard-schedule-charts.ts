// Dashboard-only appointment filtering and SVG geometry. No network or DB writes.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createWorkflowApplication } from "./fixtures/application-detail-workflow"
import { buildStudioDashboardView } from "@/features/studio/lib/studio-dashboard-view"
import { buildStudioDashboardMetrics } from "@/features/studio/lib/studio-dashboard-metrics"
import "./verify-studio-dashboard-donut"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"

const now = new Date("2026-09-29T09:00:00Z")
const base = createWorkflowApplication({
  status: "confirmed", confirmedSlotAt: "2026-09-29T10:00:00Z",
  confirmedBlockStartAt: null, confirmedBlockEndAt: null,
  requestedSlotAt: "2026-09-29T04:00:00Z", scheduleStartTime: "19:00", scheduleEndTime: "20:00",
  createdAt: "2026-09-29T09:29:00Z", updatedAt: "2026-09-29T11:17:00Z",
  lastActivityAt: "2026-09-29T11:17:00Z", completedAt: null, canceledAt: null, noShowAt: null
})
const rows = [
  {...base,id:"confirmed"},
  {...base,id:"block",confirmedSlotAt:null,confirmedBlockStartAt:"2026-09-29T11:00:00Z"},
  {...base,id:"completed",status:"completed" as const,completedAt:"2026-09-29T11:17:00Z"},
  {...base,id:"created",status:"new" as const,confirmedSlotAt:null},
  {...base,id:"reviewing",status:"reviewing" as const,confirmedSlotAt:null},
  {...base,id:"canceled",status:"canceled" as const,confirmedSlotAt:null,canceledAt:"2026-09-29T09:29:01Z"},
  {...base,id:"no-show",status:"canceled" as const,confirmedSlotAt:null,noShowAt:"2026-09-29T11:17:02Z"},
  {...base,id:"record-only",status:"completed" as const,confirmedSlotAt:null,completedAt:"2026-09-29T11:17:00Z"},
  {...base,id:"unknown",confirmedSlotAt:null},
  {...base,id:"invalid",confirmedSlotAt:"invalid"},
  {...base,id:"tomorrow",confirmedSlotAt:"2026-09-29T15:00:00Z"}
]
const view=buildStudioDashboardView(rows,now)
assert.deepEqual(view.scheduleItems.map(x=>[x.id,x.timeLabel]),[["completed","19:00"],["confirmed","19:00"],["block","20:00"]])
assert.equal(view.todayScheduleCount,3)
assert.equal(view.scheduleMode,"today")
assert.equal(buildStudioDashboardView([rows[10]],now).scheduleMode,"upcoming")
assert.equal(buildStudioDashboardView(rows.slice(3,10),now).scheduleItems.length,0)
const metrics=buildStudioDashboardMetrics(rows,resolveStudioDateRange({preset:"all"}),now)
assert.deepEqual(metrics.steps.map(s=>s.label),["신청 접수","일정 확정","체험 진행","체험 완료","등록 결과"])
assert.equal(metrics.steps[0].count,rows.length)

const page=readFileSync("app/studio/(dashboard)/page.tsx","utf8")
assert.ok(!page.includes("strokeDasharray") && page.includes("styles.donutSegment"))
console.log("PASS: confirmed occurrences only, cancellation timestamps excluded, KST day boundaries, five-stage unique cohort, all donut distributions and shared radial endpoints")
