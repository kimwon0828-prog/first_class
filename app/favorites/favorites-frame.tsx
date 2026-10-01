import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "./favorites.module.css"
export function FavoritesFrame({ children, scheduleHref, recordHref, myPageHref }: { children: ReactNode; scheduleHref?: string; recordHref?: string; myPageHref?: string }) {
  return <ParentAppShell data-parent-design="v1" className={styles.page} navigation={{ scheduleHref, recordHref, myPageHref }}><div className={styles.shell}>
    <ParentHeader title="관심수업" />
    <div className={styles.content}><p className={styles.intro}>관심수업은 이 브라우저에 저장돼요.<br /><span>언제든 다시 확인하고 수업을 신청할 수 있어요.</span></p>{children}</div>
  </div></ParentAppShell>
}
export function FavoritesSkeleton() {
  return <div className={styles.list} role="status" aria-label="관심수업 불러오는 중" aria-busy="true">{[0,1,2].map(i => <div key={i} className={styles.skeleton} aria-hidden="true"><span /><div><span /><span /><span /></div></div>)}</div>
}
