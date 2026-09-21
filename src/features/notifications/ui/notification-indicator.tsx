import styles from "./notification-indicator.module.css"
export function UnreadDot({ isUnread = false }: { isUnread?: boolean }) {
  return isUnread ? <span className={styles.dot} role="img" aria-label="미확인 알림" /> : null
}
export function NotificationBell({ isUnread = false }: { isUnread?: boolean }) {
  return <span className={styles.bell}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg><UnreadDot isUnread={isUnread} /></span>
}
