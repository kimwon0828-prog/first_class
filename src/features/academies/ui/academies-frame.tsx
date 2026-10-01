import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "../../../../app/academies/page.module.css"
export function AcademiesFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <ParentHeader title="학원 찾기" />
    <div className={styles.content}>{children}</div>
  </div></ParentAppShell>
}
export function AcademiesSkeleton() {
  return <div className={styles.skeletons} role="status" aria-busy="true" aria-label="학원 목록 불러오는 중"><div className={styles.skeletonControls} />{[0,1,2].map(key => <div key={key} className={styles.skeletonCard} aria-hidden="true" />)}</div>
}
