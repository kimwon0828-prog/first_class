import { ReportFrame } from "./report-frame"
import styles from "./page.module.css"
export default function Loading() {
  return <ReportFrame><div role="status" aria-label="체험 리포트 불러오는 중" aria-busy="true">
    {[0, 1, 2].map(key => <div key={key} className={styles.skeleton} aria-hidden="true" />)}
  </div></ReportFrame>
}
