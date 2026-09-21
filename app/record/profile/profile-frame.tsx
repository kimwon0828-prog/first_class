import Link from "next/link"
import type { ReactNode } from "react"
import { withRecordChild } from "@/features/record/lib/record-href"
import styles from "./page.module.css"

export function EducationProfileFrame({ children, childId }: { children: ReactNode; childId?: string | null }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <header className={styles.header}>
      <Link href={withRecordChild("/record", childId ?? null)} className={styles.back} aria-label="기록으로 돌아가기">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
      </Link>
      <h1 className={styles.headerTitle}>교육 프로필</h1>
    </header>
    <div className={styles.content}>{children}</div>
  </div></main>
}

export function EducationProfileSkeleton() {
  return <div role="status" aria-label="교육 프로필 불러오는 중" aria-busy="true" className={styles.loading}>
    <div className={styles.skeletonContext} aria-hidden="true" />
    {[0, 1].map(key => <div className={styles.skeletonGroup} key={key} aria-hidden="true"><div className={styles.skeletonHeading} /><div className={styles.skeletonCard} /></div>)}
  </div>
}
