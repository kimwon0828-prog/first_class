import styles from "./page.module.css"

export default function StudioAnalyticsLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="분석 불러오는 중">
    <div className={styles.header}><div className={styles.headerText}><h1 className={styles.title}>분석</h1><p className={styles.description}>불러오고 있어요.</p></div></div>
    <div className={styles.loadingBlock} aria-hidden="true" />
  </div>
}
