import { ParentHeader } from "@/features/classes/ui/parent-header"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import styles from "./page.module.css"

export default function ClassDetailLoading() {
  return <ParentAppShell className={styles.page} data-parent-design="v1" aria-busy="true" aria-label="수업 상세 불러오는 중">
    <div className={styles.shell}>
      <ParentHeader title="수업 상세" backHref="/classes" inset />
      <div className={styles.heroSection} aria-hidden="true">
        <div className={styles.imageFrame} />
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
      </div>
      <div className={styles.sections} aria-hidden="true">
        <div className={styles.section}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        <div className={styles.section}><div className={`${styles.skeleton} ${styles.skeletonShort}`} /><div className={styles.skeleton} /></div>
      </div>
    </div>
  </ParentAppShell>
}
