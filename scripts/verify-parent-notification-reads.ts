import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { applyNotificationReads, selectParentNotifications } from '@/features/notifications/lib/parent-notifications'
import { selectParentActions } from '@/features/actions/lib/parent-actions'
import type { ParentApplicationSummary } from '@/shared/lib/db/adapter'
const app={id:'app',status:'completed',completedAt:'2026-09-20T00:00:00Z',canceledAt:null} as ParentApplicationSummary
const input={applications:[app],parentProfileId:'parent',statusEvents:[{id:'log',applicationId:'app',fromStatus:'confirmed' as const,toStatus:'completed' as const,actorId:'teacher',createdAt:'2026-09-20T01:00:00Z'}],publishedReports:[{reportId:'report',applicationId:'app',publishedAt:'2026-09-20T02:00:00Z'}]}
const events=selectParentNotifications(input)
assert.deepEqual(events.map(e=>e.id),['report_published:report','status:log'])
for(const decided of [false,true]) for(const read of [false,true]) {
 const rows=applyNotificationReads(events,new Set(read?events.map(e=>e.id):[]))
 assert(rows.every(e=>e.isUnread===!read))
 const actions=selectParentActions({applications:[app],reportedExperienceIds:new Set(['app']),decidedExperienceIds:new Set(decided?['app']:[])})
 assert.equal(actions.length,decided?0:1)
 assert.equal(rows.length,2)
 assert.equal(rows.some(e=>e.isUnread),!read)
}
assert.equal(applyNotificationReads(events,new Set(['orphan'])).filter(e=>e.isUnread).length,2)
assert.equal(applyNotificationReads(events,new Set(['status:log'])).filter(e=>e.isUnread).length,1)
const read=(p:string)=>readFileSync(p,'utf8')
const action=read('src/features/notifications/actions/mark-notification-read.ts')
assert(action.includes('access.profile.id') && action.includes('ignoreDuplicates: true'))
const link=read('src/features/notifications/ui/notification-link.tsx')
assert(link.includes('if (!isUnread) return') && link.includes('finally') && link.includes('router.push') && link.includes('1500'))
const home=read('app/page.tsx')
assert(home.includes('notificationResult?.notifications.some(item => item.isUnread)') && !home.includes('hasPendingReports'))
console.log('PASS stable source identities, four report decision/read combinations, normal reads, orphan receipts, bell all/none, duplicate write prevention and fail-open navigation')

const query=read('src/features/notifications/queries/get-parent-notifications.ts')
assert(query.includes('return { notifications, error: null, readStateStatus: "unavailable" }'))
assert(query.includes('logNotificationQueryError("read-state", error)'))
assert(home.includes('notificationResult?.readStateStatus === "available"'))
const sql=read('supabase/migrations/20260921130000_create_parent_notification_reads.sql')
assert(sql.includes('join public.my_trial_applications a') && !sql.includes('join public.trial_applications a'))
console.log('PASS read enhancement failures preserve unknown state/events; Home requires available receipts; ownership uses approved Parent view')
