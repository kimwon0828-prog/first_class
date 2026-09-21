import type { Metadata } from "next"
import { unstable_noStore as noStore } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { groupNotificationsBySeoulDate } from "@/features/notifications/lib/parent-notifications"
import { getParentNotifications } from "@/features/notifications/queries/get-parent-notifications"
import { NotificationsFrame } from "@/features/notifications/ui/notifications-frame"
import { NotificationRow } from "@/features/notifications/ui/notification-row"
import { NotificationsRetry } from "@/features/notifications/ui/notifications-retry"
import styles from "./page.module.css"
export const metadata: Metadata = { title: "알림 | 첫수업", description: "최근 첫수업 관련 변화와 안내를 다시 확인할 수 있습니다.", alternates: { canonical: "/notifications" } }
export const dynamic = "force-dynamic"
export const revalidate = 0
export default async function ParentNotificationsPage() {
 noStore()
 const profile = await requireParentAccess({ returnTo: "/notifications" })
 const { notifications, error } = await getParentNotifications(profile.id)
 const groups = groupNotificationsBySeoulDate(notifications)
 return <NotificationsFrame>{error ? <NotificationsRetry /> : groups.length === 0 ? <section className={styles.state}><h2>아직 받은 알림이 없어요.</h2><p>신청, 일정, 리포트 소식이<br />여기에 표시돼요.</p></section> : groups.map(group => <section key={group.dateKey} className={styles.group} aria-label={group.dateLabel}><h2>{group.dateLabel}</h2><ul>{group.items.map(item => <li key={item.id}><NotificationRow item={item} /></li>)}</ul></section>)}</NotificationsFrame>
}
