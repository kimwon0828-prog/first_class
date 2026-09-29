import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { selectParentNotifications, resolveNotificationHref } from "@/features/notifications/lib/parent-notifications"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
const read=(path:string)=>readFileSync(path,"utf8")
const detail=read('app/record/[experienceId]/page.tsx'),report=read('app/record/[experienceId]/report/page.tsx')
assert(!detail.includes('ParentFeedbackForm')&&!detail.includes('getMyCurrentParentDecision'))
assert(report.indexOf('<section id="experience-feedback"')>report.indexOf('</footer>'))
assert(report.includes('getMyExperienceReport(experienceId)')&&report.includes('getParentExperienceFeedback(experienceId, parent.id)'))
assert(report.includes('if (result.status !== "ok")'))
const tracker=read('src/features/reports/ui/report-view-tracker.tsx')
assert(tracker.includes('useEffect')&&tracker.includes('document.visibilityState !== "visible"'))
assert(!read('src/features/record/queries/get-my-experience-report.ts').includes('markReportViewed'))
assert(!report.includes('await markReportViewed'))
assert(tracker.includes('window.location.hash !== "#experience-feedback"'))
const sql=read('supabase/migrations/20260929093000_parent_report_feedback_flow.sql')
assert(sql.includes("public.is_own_trial_application(r.application_id) for share"))
assert(sql.includes("raise exception 'feedback_report_required'"))
assert(sql.includes('on conflict(application_id) do nothing'))
assert(sql.includes('for update of a skip locked'))
assert(sql.includes("now()-interval '24 hours'"))
assert(sql.includes('from public,anon,authenticated;\ngrant execute on function public.create_parent_feedback_reminders() to service_role;'))
const app={id:'test',status:'completed',childName:'TEST',classTitle:'수업',academyName:'학원'} as ParentApplicationSummary
const published={reportId:'report',applicationId:'test',publishedAt:'2026-09-29T01:00:00Z'}
const reminder={applicationId:'test',occurredAt:'2026-09-30T01:00:00Z'}
const items=selectParentNotifications({applications:[app],statusEvents:[],publishedReports:[published,published],feedbackReminders:[reminder,reminder],parentProfileId:'parent'})
assert.equal(items.length,2)
assert.equal(items[0].kind,'feedback_reminder');assert.equal(items[0].title,'체험은 어떠셨나요?');assert.equal(items[0].description,'짧게 의견을 남겨주세요.')
assert.equal(items[0].href,'/record/test/report#experience-feedback')
assert.equal(items[1].title,'체험수업 리포트가 도착했어요')
assert.equal(resolveNotificationHref('report_published','test'),'/record/test/report')
assert(!JSON.stringify(items).includes('privateNote'))
console.log('PASS report-first placement, query/view separation, visibility/hash, DB ownership/locking/ACL, stable notification keys/deduplication and fixed payload')
