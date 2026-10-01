import { ParentHeader } from "@/features/classes/ui/parent-header"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import styles from "./page.module.css"
export default function Loading() {
  return <ParentAppShell className={styles.page} data-parent-design="v1" aria-busy="true" aria-label="체험 기록 불러오는 중">
    <div className={styles.shell}><ParentHeader title="체험 기록" backHref="/record" />
      <div className={styles.content}>{[0, 1, 2].map(key => <div key={key} className={styles.skeleton} aria-hidden="true" />)}</div>
    </div>
  </ParentAppShell>
}
