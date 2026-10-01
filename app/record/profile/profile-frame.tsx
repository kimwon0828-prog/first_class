import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import { withRecordChild } from "@/features/record/lib/record-href"
import styles from "./page.module.css"

export function EducationProfileFrame({ children, childId }: { children: ReactNode; childId?: string | null }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1"><div className={styles.shell}>
    <ParentHeader title="교육 프로필" backHref={withRecordChild("/record", childId ?? null)} sticky />
    <div className={styles.content}>{children}</div>
  </div></ParentAppShell>
}

export function EducationProfileSkeleton() {
  return <div role="status" aria-label="교육 프로필 불러오는 중" aria-busy="true" className={styles.loading}>
    <div className={styles.skeletonContext} aria-hidden="true" />
    {[0, 1].map(key => <div className={styles.skeletonGroup} key={key} aria-hidden="true"><div className={styles.skeletonHeading} /><div className={styles.skeletonCard} /></div>)}
  </div>
}
