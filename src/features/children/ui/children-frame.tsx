import Link from "next/link"
import type { ReactNode } from "react"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import styles from "../../../../app/my/children/page.module.css"

export function ChildrenFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1">
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/my" aria-label="뒤로가기" className={styles.backButton}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Link>
        <h1 className={styles.title}>자녀 관리</h1>
        <span aria-hidden="true" />
      </header>
      <div className={styles.content}>{children}</div>
    </div>
    <ParentBottomNav designVersion="v1" />
  </main>
}

export function ChildrenSkeleton() {
  return <div className={styles.skeletons} role="status" aria-label="자녀 정보를 불러오는 중" aria-busy="true">
    <div className={styles.skeletonNotice} />
    {[0, 1].map(key => <div key={key} className={styles.skeletonCard} aria-hidden="true" />)}
  </div>
}
