import assert from 'node:assert/strict'
import { createWorkflowApplication, createWorkflowEvidence } from './fixtures/application-detail-workflow'
import { deriveApplicationDetailWorkflow, getApplicationJourney } from '@/features/studio/lib/application-detail-workflow-state'
import { getCaseNextAction } from '@/features/studio/lib/case-view-model'
import { buildStudioDashboardMetrics } from '@/features/studio/lib/studio-dashboard-metrics'
import { resolveStudioDateRange } from '@/features/studio/lib/studio-date-range'
import { buildStudioScheduleEvents } from '@/features/studio/lib/studio-schedule-events'
const now = new Date('2026-09-29T06:30:00Z')
const base = createWorkflowApplication({assignedTeacherId:null,assignedTeacherName:null,confirmedBlockStartAt:null,confirmedBlockEndAt:null,confirmedScheduleBlockId:null,confirmedSlotAt:null,completedAt:null})
for (const status of ['new','reviewing'] as const) {
 const a = {...base,status}
 const w = deriveApplicationDetailWorkflow({application:a,evidence:createWorkflowEvidence(),nowIso:now.toISOString(),canWriteTrialResults:true,canWriteConsultations:true})
 assert.equal(w.primary?.label,'일정 확정하기')
 assert.equal(getCaseNextAction({...a,trialResultExists:false,hasAnyConsultationHistory:false},now).key,'CONFIRM_SCHEDULE')
 assert.deepEqual(getApplicationJourney(a,now).map(x=>x.title),['신청 접수','일정 확정','체험 진행','체험 완료','등록 결과'])
}
const confirmed = {...base,status:'confirmed' as const,confirmedSlotAt:'2026-09-29T06:00:00Z',scheduleStartTime:'15:00',scheduleEndTime:'16:00'}
assert.equal(getApplicationJourney(confirmed,now)[2].state,'current')
assert.equal(getApplicationJourney(confirmed,new Date('2026-09-29T07:01:00Z'))[3].state,'current')
assert.equal(getApplicationJourney(confirmed,new Date('2026-09-29T05:00:00Z'))[2].summary,'체험 예정')
assert.equal(buildStudioScheduleEvents([confirmed],now)[0].assignedTeacherId,null)
assert.notEqual(getCaseNextAction({...confirmed,trialResultExists:false,hasAnyConsultationHistory:false},now).key,'UNASSIGNED')
const rows=[{...base,status:'new' as const},{...base,status:'reviewing' as const},confirmed,{...base,status:'completed' as const,registrationStatus:'enrolled' as const}]
const metrics=buildStudioDashboardMetrics(rows,resolveStudioDateRange({preset:'all'}),now)
assert.deepEqual(metrics.steps.map(x=>x.count),[4,2,2,1,1])
assert.equal(metrics.registrationConversionRate,100)
console.log('PASS unassigned policy: new/legacy direct confirmation CTA, optional assignment, five-stage journey, Schedule and distinct funnel cohort')
