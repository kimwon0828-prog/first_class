import type { Metadata } from "next"
import { unstable_noStore as noStore } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getParentNotifications } from "@/features/notifications/queries/get-parent-notifications"
import type { ParentNotification } from "@/features/notifications/lib/parent-notifications"
import { NotificationsFrame } from "@/features/notifications/ui/notifications-frame"
import { NotificationRow, notificationDaysAgo } from "@/features/notifications/ui/notification-row"
import { NotificationsRetry } from "@/features/notifications/ui/notifications-retry"
import { EmptyState, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"
export const metadata: Metadata = { title: "알림 | 첫수업", description: "최근 첫수업 관련 변화와 안내를 다시 확인할 수 있습니다.", alternates: { canonical: "/notifications" } }
export const dynamic = "force-dynamic"
export const revalidate = 0
const GROUPS = ["오늘", "이번 주", "지난 알림"] as const
// 앱과 같이 오늘 / 이번 주(7일 안) / 지난 알림으로 묶는다.
const groupOf = (value: string, now: number) => { const days = notificationDaysAgo(value, now); return days <= 0 ? "오늘" : days < 7 ? "이번 주" : "지난 알림" }
export default async function ParentNotificationsPage() {
 noStore()
 const profile = await requireParentAccess({ returnTo: "/notifications" })
 const { notifications, error } = await getParentNotifications(profile.id)
 const now = Date.now()
 const groups = new Map<string, ParentNotification[]>()
 for (const item of notifications) { const key = groupOf(item.occurredAt, now); groups.set(key, [...(groups.get(key) ?? []), item]) }
 return <NotificationsFrame>{error ? <NotificationsRetry />
  : notifications.length === 0 ? <EmptyState icon="bell" title="아직 알림이 없어요" body={"체험을 신청하면 일정 확정과\n리포트 도착을 여기서 알려드려요"} />
  : GROUPS.filter(key => groups.has(key)).map(key => <section key={key} className={styles.group} aria-label={key}><h2 className={ui.groupLabel}>{key}</h2><ul>{groups.get(key)!.map(item => <li key={item.id}><NotificationRow item={item} now={now} /></li>)}</ul></section>)}</NotificationsFrame>
}
