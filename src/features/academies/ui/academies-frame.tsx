import Link from "next/link"
import type { ReactNode } from "react"
import styles from "../../../../app/academies/page.module.css"
export function AcademiesFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <header className={styles.header}><Link href="/" className={styles.backButton} aria-label="홈으로 돌아가기"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></Link><h1 className={styles.title}>학원 찾기</h1></header>
    <div className={styles.content}>{children}</div>
  </div></main>
}
export function AcademiesSkeleton() {
  return <div className={styles.skeletons} role="status" aria-busy="true" aria-label="학원 목록 불러오는 중"><div className={styles.skeletonControls} />{[0,1,2].map(key => <div key={key} className={styles.skeletonCard} aria-hidden="true" />)}</div>
}
