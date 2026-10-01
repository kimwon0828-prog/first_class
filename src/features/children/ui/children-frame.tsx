import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "../../../../app/my/children/page.module.css"

export function ChildrenFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1">
    <div className={styles.shell}>
      <ParentHeader title="자녀 관리" backHref="/my" sticky />
      <div className={styles.content}>{children}</div>
    </div>
  </ParentAppShell>
}

export function ChildrenSkeleton() {
  return <div className={styles.skeletons} role="status" aria-label="자녀 정보를 불러오는 중" aria-busy="true">
    <div className={styles.skeletonNotice} />
    {[0, 1].map(key => <div key={key} className={styles.skeletonCard} aria-hidden="true" />)}
  </div>
}
