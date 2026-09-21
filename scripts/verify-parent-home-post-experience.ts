import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { selectParentHomeActions, resolveHomeExperienceAction } from "@/features/actions/lib/parent-home-actions"
import { applyNotificationReads, selectParentNotifications } from "@/features/notifications/lib/parent-notifications"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
const app = {id:"exp", status:"completed",completedAt:"2026-09-20T00:00:00Z",canceledAt:null,childId:"child",childName:"가온",childGrade:"E3",classTitle:"파이썬",canCollectParentDecision:true} as ParentApplicationSummary
const events=selectParentNotifications({applications:[app],statusEvents:[],publishedReports:[{reportId:"report",applicationId:"exp",publishedAt:"2026-09-20T01:00:00Z"}],parentProfileId:"parent"})
const select=(read:boolean,decision:boolean)=>selectParentHomeActions({applications:[app],notifications:applyNotificationReads(events,new Set(read?[events[0].id]:[])),decidedExperienceIds:new Set(decision?[app.id]:[])})
for(const decided of [false,true]) {
 const unread=select(false,decided);assert.equal(unread[0].kind,"report_review");assert.equal(unread[0].notificationKey,events[0].id)
 assert.equal(unread[0].href,"/record/exp/report")
}
const next=select(true,false);assert.equal(next[0].kind,"experience_reflection");assert.equal(next[0].ctaLabel,"등록 여부 남기기");assert.equal(next[0].href,"/record/exp#decision-title")
assert(!next[0].notificationKey);assert(!next[0].title.includes("리포트"))
for(const decision of ['planned','considering','declined']) {assert.equal(select(true,Boolean(decision)).length,0)}
assert.equal(events.length,1);assert.equal(applyNotificationReads(events,new Set([events[0].id]))[0].isUnread,false)
assert.equal(selectParentHomeActions({applications:[app],notifications:events,decidedExperienceIds:new Set()}).length,0)
assert.equal(selectParentHomeActions({applications:[{...app,canCollectParentDecision:false}],notifications:applyNotificationReads(events,new Set([events[0].id])),decidedExperienceIds:new Set()}).length,0)
assert.equal(resolveHomeExperienceAction({reportRead:true,parentDecisionCompleted:true}),null)
assert.equal(resolveHomeExperienceAction({reportRead:true,parentDecisionCompleted:true,academyEvaluationCompleted:false}),"experience_reflection")
assert.equal(resolveHomeExperienceAction({reportRead:true,parentDecisionCompleted:true,academyEvaluationCompleted:true}),null)
assert.equal(resolveHomeExperienceAction({reportRead:null,parentDecisionCompleted:false}),null)
const home=readFileSync('app/page.tsx','utf8')
assert(home.includes('notificationKey={report.notificationKey ?? ""}') && home.includes('isUnread={report.kind === "report_review"}'))
assert(home.includes('hasHomeUnreadNotifications(notificationResult)'))
assert(readFileSync('src/features/notifications/actions/mark-notification-read.ts','utf8').includes('revalidatePath("/")'))
console.log('PASS unread -> read -> decision, considering completed, independent history/bell, unknown read/evaluation, disabled decision CTA, Home persisted read link and revalidation')

const older={...app,id:"older",completedAt:"2026-09-19T00:00:00Z"}
const mixed=selectParentHomeActions({applications:[app,older],notifications:[...applyNotificationReads(events,new Set([events[0].id])),{...events[0],id:"report_published:older",href:"/record/older/report",isUnread:true}],decidedExperienceIds:new Set()})
assert.deepEqual(mixed.map(item=>item.kind),["report_review","experience_reflection"])
assert.equal(selectParentHomeActions({applications:[{...app,status:"canceled"}],notifications:applyNotificationReads(events,new Set()),decidedExperienceIds:new Set()}).length,0)
assert.equal(selectParentHomeActions({applications:[app],notifications:[],decidedExperienceIds:new Set()}).length,0)
console.log('PASS unread priority, no published source, canceled exclusion')
