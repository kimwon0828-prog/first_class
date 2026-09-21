"use client"
import { ReportFrame } from "./report-frame"
import styles from "./page.module.css"
export default function ErrorState() {
  return <ReportFrame><section className={styles.emptyState} role="alert">
    <h2 className={styles.blockTitle}>리포트를 불러오지 못했어요.</h2>
    <p className={styles.muted}>잠시 후 다시 시도해 주세요.</p>
    <button className={styles.primaryAction} onClick={() => window.location.reload()}>다시 시도</button>
  </section></ReportFrame>
}
