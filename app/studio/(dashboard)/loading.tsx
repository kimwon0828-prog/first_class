import styles from "./page.module.css"

export default function StudioDashboardLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="Studio 불러오는 중">
    <div className={styles.header}><div className={styles.loadingLine} /></div>
    <div className={styles.chartRow} aria-hidden="true">
      {[0, 1, 2].map(key => <div className={styles.chartCard} key={key}><div className={styles.loadingChart} /></div>)}
    </div>
    <div className={styles.workspace} aria-hidden="true" style={{ marginTop: "var(--s5)" }}>
      {[0, 1].map(key => <div className={styles.panel} key={key}>{[0, 1, 2].map(row => <div className={styles.loadingRow} key={row} />)}</div>)}
    </div>
    <p className={styles.periodNote}>Studio를 불러오고 있습니다.</p>
  </div>
}
