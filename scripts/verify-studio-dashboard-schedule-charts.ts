// Dashboard-only appointment filtering and SVG geometry. No network or DB writes.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createWorkflowApplication } from "./fixtures/application-detail-workflow"
import { buildStudioDashboardView } from "@/features/studio/lib/studio-dashboard-view"
import { buildStudioDashboardMetrics } from "@/features/studio/lib/studio-dashboard-metrics"
import { buildStudioDonutArcs } from "@/features/studio/lib/studio-dashboard-donut"
import { STUDIO_DONUT_RADIUS as radius, STUDIO_DONUT_VIEWBOX as viewBox } from "@/features/studio/lib/studio-dashboard-analytics"
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

for(const counts of [[50,50],[100,0],[0,100],[25,25,25,25],[50,25,25,0],[1,99],[0,0,0,0],[50,0,0,50],[4,0,0,5]]) {
  const arcs=buildStudioDonutArcs(counts,counts.reduce((a,b)=>a+b,0))
  assert.equal(arcs.filter(Boolean).length,counts.filter(n=>n>0).length)
  let previousEnd: number[] | null=null
  for(const arc of arcs) {
    if(!arc)continue
    if(arc.fullCircle){assert.equal(arcs.filter(Boolean).length,1);continue}
    const values=arc.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
    assert.ok(values.every(Number.isFinite))
    const start=values.slice(0,2),end=values.slice(-2)
    if(previousEnd)assert.deepEqual(start,previousEnd)
    for(const [x,y] of [start,end])assert.ok(Math.abs(Math.hypot(x-viewBox/2,y-viewBox/2)-radius)<1e-7)
    previousEnd=end
  }
}
const page=readFileSync("app/studio/(dashboard)/page.tsx","utf8")
assert.ok(!page.includes("strokeDasharray") && page.includes('strokeLinecap="butt"'))
console.log("PASS: confirmed occurrences only, cancellation timestamps excluded, KST day boundaries, five-stage unique cohort, all donut distributions and shared radial endpoints")
