import Link from "next/link"
import type { ReactNode } from "react"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import styles from "./page.module.css"
export function ProfileFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <header className={styles.header}><Link href="/my" className={styles.back} aria-label="마이페이지로 돌아가기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></Link><h1>내 정보 수정</h1></header>
    <div className={styles.content}><p className={styles.intro}>첫수업에서 사용하는 기본 정보를<br />확인하고 수정해요.</p>{children}</div>
  </div><ParentBottomNav designVersion="v1" /></main>
}
export function ProfileSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="내 정보 불러오는 중" aria-busy="true">{[0,1,2].map(i=><div key={i} aria-hidden="true"><span /><div /></div>)}<div className={styles.skeletonButton} aria-hidden="true" /></div>
}
