import Link from "next/link"
import type { ReactNode } from "react"
import styles from "../../../../app/notifications/page.module.css"
export function NotificationsFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}><header className={styles.header}><Link href="/" className={styles.backButton} aria-label="홈으로 돌아가기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></Link><h1>알림</h1></header><div className={styles.content}>{children}</div></div></main>
}
