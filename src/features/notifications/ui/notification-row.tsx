import Link from "next/link"
import { formatNotificationTime, type ParentNotification, type ParentNotificationKind } from "../lib/parent-notifications"
import { UnreadDot } from "./notification-indicator"
import styles from "../../../../app/notifications/page.module.css"
const paths: Record<ParentNotificationKind, string> = {
 report_published: "M6 3h9l3 3v15H6V3Zm3 6h6M9 13h6M9 17h4",
 schedule_confirmed: "M4 5h16v16H4V5Zm4-2v4m8-4v4M4 10h16m-12 5 3 3 5-5",
 application_reviewing: "M9 3H5v18h14V3h-4M9 3h6v4H9V3Zm0 9h6m-6 4h4",
 application_canceled: "M5 3h14v18H5V3Zm4 7 6 6m0-6-6 6",
 experience_completed: "m7 12 3 3 7-7M21 12a9 9 0 1 1-9-9"
}
export function NotificationRow({ item, isUnread = false }: { item: ParentNotification; isUnread?: boolean }) {
 return <Link href={item.href} className={styles.item}>
  <span className={styles.icon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[item.kind]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
  <span className={styles.itemBody}>
   <span className={styles.itemTitle}>{item.title}<UnreadDot isUnread={isUnread} /></span>
   {item.childName || item.classTitle ? <span className={styles.itemMeta}>{[item.childName,item.classTitle].filter(Boolean).join(" · ")}</span> : null}
   {item.academyName ? <span className={styles.itemMeta}>{item.academyName}</span> : null}
   <time dateTime={item.occurredAt} className={styles.time}>{formatNotificationTime(item.occurredAt)}</time>
  </span>
  <svg className={styles.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
 </Link>
}
