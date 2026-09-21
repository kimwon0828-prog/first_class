import Link from "next/link"
import type { ReactNode } from "react"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import styles from "./favorites.module.css"
export function FavoritesFrame({ children, scheduleHref, recordHref, myPageHref }: { children: ReactNode; scheduleHref?: string; recordHref?: string; myPageHref?: string }) {
  return <main data-parent-design="v1" className={styles.page}><div className={styles.shell}>
    <header className={styles.header}><Link href="/my" className={styles.back} aria-label="마이페이지로 돌아가기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg></Link><h1>관심수업</h1></header>
    <div className={styles.content}><p className={styles.intro}>관심수업은 이 브라우저에 저장돼요.<br /><span>언제든 다시 확인하고 수업을 신청할 수 있어요.</span></p>{children}</div>
  </div><ParentBottomNav designVersion="v1" scheduleHref={scheduleHref} recordHref={recordHref} myPageHref={myPageHref} /></main>
}
export function FavoritesSkeleton() {
  return <div className={styles.list} role="status" aria-label="관심수업 불러오는 중" aria-busy="true">{[0,1,2].map(i => <div key={i} className={styles.skeleton} aria-hidden="true"><span /><div><span /><span /><span /></div></div>)}</div>
}
