import { NotificationLink } from "./notification-link"
import type { ParentNotification, ParentNotificationKind } from "../lib/parent-notifications"
import { seoulDateKey } from "@/features/classes/lib/app-presentation"
import { AppIcon, type AppIconName } from "@/features/classes/ui/app-icon"
import styles from "../../../../app/notifications/page.module.css"

// 앱 notifications.tsx: 알림 종류(kind)로만 아이콘을 고른다.
const icons: Record<ParentNotificationKind, AppIconName> = {
 report_published: "file-text", feedback_reminder: "message-square", schedule_confirmed: "calendar",
 application_reviewing: "clock", application_canceled: "x", experience_completed: "check"
}
const DAY = 24 * 60 * 60 * 1000
export const notificationDaysAgo = (value: string, now: number) => Math.round((Date.parse(seoulDateKey(new Date(now).toISOString())) - Date.parse(seoulDateKey(value))) / DAY)
/** "방금 · N분 전 · N시간 전 · 어제 · 10월 3일" */
export function notificationWhen(value: string, now: number) {
 const minutes = Math.floor((now - Date.parse(value)) / 60000), days = notificationDaysAgo(value, now)
 if (minutes < 1) return "방금"
 if (minutes < 60) return `${minutes}분 전`
 if (days === 0) return `${Math.floor(minutes / 60)}시간 전`
 if (days === 1) return "어제"
 const key = seoulDateKey(value)
 return `${Number(key.slice(5, 7))}월 ${Number(key.slice(8))}일`
}
export function NotificationRow({ item, now }: { item: ParentNotification; now: number }) {
 const context = [item.childName, item.contextLabel].filter(Boolean).join(" · ")
 return <NotificationLink notificationKey={item.id} isUnread={item.isUnread} href={item.href} className={styles.item}>
  <span className={styles.icon} aria-hidden="true"><AppIcon name={icons[item.kind] ?? "bell"} size={20} /></span>
  <span className={styles.itemBody}>
   <span className={styles.itemTitle}>{item.title}</span>
   {context ? <span className={styles.itemMeta}>{context}</span> : null}
   <time dateTime={item.occurredAt} className={styles.time}>{notificationWhen(item.occurredAt, now)}</time>
  </span>
  {item.isUnread ? <span className={styles.unreadDot} role="img" aria-label="새 알림" /> : null}
 </NotificationLink>
}
