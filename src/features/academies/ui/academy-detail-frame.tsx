import Link from "next/link"
import type { ReactNode } from "react"
import styles from "../../../../app/academy/[handle]/page.module.css"

export function AcademyIcon() {
  return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 21V7l8-4 8 4v14H4ZM10 21v-6h4v6M8 9v2M12 8v3M16 9v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
export function AcademyDetailFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <header className={styles.header}><Link href="/academies" className={styles.back} aria-label="학원 목록으로 돌아가기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></Link><p>학원 소개</p></header>
    <div className={styles.content}>{children}</div>
  </div></main>
}
