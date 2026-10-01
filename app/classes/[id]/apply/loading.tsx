import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import styles from "./loading.module.css"

export default function ClassApplyLoading() {
  return <ParentAppShell navigation={false} className={styles.page}>
    <div className={styles.shell}>
      <ParentHeader title="첫수업 신청" backHref="/classes" />
      <div className={styles.body} role="status" aria-label="신청 정보 확인 중" aria-busy="true">
        <div className={styles.summary} aria-hidden="true"><span /><span /></div>
        {[0, 1, 2].map(key => <div className={styles.field} key={key} aria-hidden="true"><span /><div /></div>)}
        <div className={styles.button} aria-hidden="true" />
      </div>
    </div>
  </ParentAppShell>
}
