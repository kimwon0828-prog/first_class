import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "./page.module.css"
export function ProfileFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <ParentHeader title="내 정보 수정" backHref="/my" sticky />
    <div className={styles.content}><p className={styles.intro}>첫수업에서 사용하는 기본 정보를<br />확인하고 수정해요.</p>{children}</div>
  </div></ParentAppShell>
}
export function ProfileSkeleton() {
  return <div className={styles.skeleton} role="status" aria-label="내 정보 불러오는 중" aria-busy="true">{[0,1,2].map(i=><div key={i} aria-hidden="true"><span /><div /></div>)}<div className={styles.skeletonButton} aria-hidden="true" /></div>
}
