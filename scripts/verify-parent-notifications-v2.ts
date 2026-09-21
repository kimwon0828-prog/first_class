import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { selectParentActions } from "@/features/actions/lib/parent-actions"
import { selectParentNotifications } from "@/features/notifications/lib/parent-notifications"
import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
const app = {id:"exp",status:"completed",completedAt:"2026-09-20T00:00:00Z",canceledAt:null,childName:"가온",classTitle:"파이썬",academyName:"학원"} as ParentApplicationSummary
const reportedExperienceIds=new Set(["exp"])
const pending=selectParentActions({applications:[app],reportedExperienceIds,decidedExperienceIds:new Set()})
const decided=selectParentActions({applications:[app],reportedExperienceIds,decidedExperienceIds:new Set(["exp"])})
assert.equal(pending.length,1);assert.equal(decided.length,0)
const input={applications:[app],statusEvents:[],publishedReports:[{reportId:"rep",applicationId:"exp",publishedAt:"2026-09-20T00:00:00Z"}],parentProfileId:"parent"}
const event=selectParentNotifications(input)[0]
assert.equal(event.kind,"report_published");assert.equal(event.href,pending[0].href)
assert.equal(selectParentNotifications(input).length,1)
const read=(p:string)=>readFileSync(p,"utf8")
assert(!existsSync("app/my/actions/page.tsx") && !existsSync("app/my/actions/page.module.css"))
assert(read("next.config.mjs").includes('source: "/my/actions", destination: "/notifications"'))
const row=read("src/features/notifications/ui/notification-row.tsx")
assert(row.includes('item.kind === "report_published"') && row.includes('hasPendingReport ?'))
assert(row.includes('hasPendingReport ?') && row.includes('item.isUnread'))
const home=read("src/features/classes/queries/get-parent-home-summary.ts")
assert(!home.includes('hasPendingReports'))
assert(read('app/page.tsx').includes('notificationResult?.notifications.some(item => item.isUnread)'))
assert(read("src/features/decisions/actions/set-parent-decision.ts").includes('revalidatePath("/notifications")'))
assert(!read("src/features/notifications/queries/get-parent-notifications.ts").includes('getParentActions'))
console.log('PASS: decision controls pending action, never event existence; removed route redirect; report variant; parent-wide bell; revalidation')
