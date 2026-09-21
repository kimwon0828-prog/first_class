import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { formatNotificationDateLabel, formatNotificationTime } from "@/features/notifications/lib/parent-notifications"
const now = "2026-09-21T01:00:00Z"
assert.equal(formatNotificationDateLabel("2026-09-20T15:01:00Z",now),"오늘")
assert.equal(formatNotificationDateLabel("2026-08-12T00:00:00Z",now),"8월 12일 (수)")
assert.equal(formatNotificationDateLabel("2025-12-03T00:00:00Z",now),"2025년 12월 3일 (수)")
assert.equal(formatNotificationTime("2026-09-20T15:01:00Z"),"00:01")
assert.equal(formatNotificationTime("invalid"),"")
const read=(p:string)=>readFileSync(p,"utf8")
const page=read("app/notifications/page.tsx")
const row=read("src/features/notifications/ui/notification-row.tsx")
const frame=read("src/features/notifications/ui/notifications-frame.tsx")
const indicator=read("src/features/notifications/ui/notification-indicator.tsx")
assert(!page.includes("ParentBottomNav") && !frame.includes("<nav"))
assert(frame.includes('href="/"'))
assert(!page.includes("isUnread="))
assert(read("app/page.tsx").includes("<NotificationBell />"))
assert(indicator.includes("isUnread = false") && indicator.includes("return isUnread ?"))
assert(row.includes("isUnread = false") && !row.includes("확인하기"))
assert(row.includes("item.academyName") && row.includes("item.classTitle"))
assert(row.includes("dateTime={item.occurredAt}"))
assert(read("src/features/notifications/ui/notifications-retry.tsx").includes("router.refresh()"))
console.log("PASS: Seoul today/year/weekday/time, standalone navigation, explicit unread presentation only, row and real retry")
