import { NotificationLink } from "./notification-link"
import { formatNotificationTime, type ParentNotification, type ParentNotificationKind } from "../lib/parent-notifications"
import styles from "../../../../app/notifications/page.module.css"
const paths: Record<ParentNotificationKind, string> = {
 report_published: "M6 3h9l3 3v15H6V3Zm3 6h6M9 13h6M9 17h4",
 schedule_confirmed: "M4 5h16v16H4V5Zm4-2v4m8-4v4M4 10h16m-12 5 3 3 5-5",
 application_reviewing: "M9 3H5v18h14V3h-4M9 3h6v4H9V3Zm0 9h6m-6 4h4",
 application_canceled: "M5 3h14v18H5V3Zm4 7 6 6m0-6-6 6",
 experience_completed: "m7 12 3 3 7-7M21 12a9 9 0 1 1-9-9"
}
export function NotificationRow({ item, hasPendingReport = false }: { item: ParentNotification; hasPendingReport?: boolean }) {
 if (item.kind === "report_published") return <article className={`${styles.reportCard} ${item.isUnread ? styles.unread : ""}`}>
  <div className={styles.reportHeader}><span className={styles.icon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths.report_published} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
   <div className={styles.itemBody}><h3 className={styles.itemTitle}>{item.title}{item.isUnread ? <span className={styles.unreadDot} role="img" aria-label="읽지 않은 알림" /> : null}</h3>
    {item.childName || item.classTitle ? <p className={styles.itemMeta}>{[item.childName,item.classTitle].filter(Boolean).join(" · ")}</p> : null}
    {item.academyName ? <p className={styles.itemMeta}>{item.academyName}</p> : null}
   </div>
  </div>
  <p className={styles.reportDescription}>리포트에서 선생님이 남긴 관찰을 확인해보세요.</p>
  {hasPendingReport ? <p className={styles.reportDescription}>리포트를 확인하고 이번 경험에 대한 내 생각도 남길 수 있어요.</p> : null}
  <NotificationLink notificationKey={item.id} isUnread={item.isUnread} href={item.href} className={styles.reportButton}>리포트 보기</NotificationLink>
  <time dateTime={item.occurredAt} className={styles.time}>{formatNotificationTime(item.occurredAt)}</time>
 </article>
 return <NotificationLink notificationKey={item.id} isUnread={item.isUnread} href={item.href} className={`${styles.item} ${item.isUnread ? styles.unread : styles.read}`}>
  <span className={styles.icon}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={paths[item.kind]} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
  <span className={styles.itemBody}>
   <span className={styles.itemTitle}>{item.title}{item.isUnread ? <span className={styles.unreadDot} role="img" aria-label="읽지 않은 알림" /> : null}</span>
   {item.childName || item.classTitle ? <span className={styles.itemMeta}>{[item.childName,item.classTitle].filter(Boolean).join(" · ")}</span> : null}
   {item.academyName ? <span className={styles.itemMeta}>{item.academyName}</span> : null}
   <time dateTime={item.occurredAt} className={styles.time}>{formatNotificationTime(item.occurredAt)}</time>
  </span>
  <svg className={styles.chevron} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
 </NotificationLink>
}
