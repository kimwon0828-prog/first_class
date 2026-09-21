import Link from "next/link"
import type { ReactNode } from "react"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import styles from "./page.module.css"
export function ApplicationsFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <header className={styles.header}><Link href="/my" className={styles.back} aria-label="마이페이지로 돌아가기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></Link><h1>신청 현황</h1></header>
    <div className={styles.content}><p className={styles.intro}>신청한 체험수업과 레벨테스트의 진행 상태를 확인해요.</p>{children}</div>
  </div><ParentBottomNav designVersion="v1" /></main>
}
export function ApplicationsSkeleton() {
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="신청 현황 불러오는 중"><div className={styles.skeletonTabs} aria-hidden="true" />{[0, 1, 2].map(i => <div className={styles.skeletonCard} key={i} aria-hidden="true"><div className={styles.skeletonTop}><span /><div><i /><i /><i /></div></div><div className={styles.skeletonLines}><i /><i /></div></div>)}</div>
}
