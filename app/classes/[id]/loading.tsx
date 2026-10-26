import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentBackLink } from "@/features/classes/ui/parent-back-link"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"

export default function ClassDetailLoading() {
  return <ParentAppShell navigation={false} className={ui.page} aria-busy="true" aria-label="수업 상세 불러오는 중">
    <div className={ui.column}>
      <div className={ui.content} data-flush>
        <div className={ui.hero} aria-hidden="true" />
        <div className={ui.heroButtons} style={{ top: 12 }}>
          <ParentBackLink href="/classes" preferHistory label="뒤로가기" className={ui.circle}><AppIcon name="chevron-left" size={22} /></ParentBackLink>
        </div>
        <div className={styles.skeletonStack} aria-hidden="true">
          <div className={`${ui.skeleton} ${styles.skeletonLine}`} />
          <div className={`${ui.skeleton} ${styles.skeletonTitle}`} />
          <div className={`${ui.skeleton} ${styles.skeletonBlock}`} />
        </div>
        <AppLoading label="수업 상세 불러오는 중" />
      </div>
    </div>
  </ParentAppShell>
}
