import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "./page.module.css"
export function ApplicationsFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <ParentHeader title="신청 현황" backHref="/my" sticky />
    <div className={styles.content}><p className={styles.intro}>신청한 체험수업과 레벨테스트의 진행 상태를 확인해요.</p>{children}</div>
  </div></ParentAppShell>
}
export function ApplicationsSkeleton() {
  return <div className={styles.skeleton} role="status" aria-busy="true" aria-label="신청 현황 불러오는 중"><div className={styles.skeletonTabs} aria-hidden="true" />{[0, 1, 2].map(i => <div className={styles.skeletonCard} key={i} aria-hidden="true"><div className={styles.skeletonTop}><span /><div><i /><i /><i /></div></div><div className={styles.skeletonLines}><i /><i /></div></div>)}</div>
}
