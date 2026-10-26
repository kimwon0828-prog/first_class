import styles from "./sales-map.module.css"

export default function AdminSalesMapLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="영업 지도 불러오는 중">
      <div className={styles.container} aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonBlock}`} />
        <span className={`${styles.skeleton} ${styles.skeletonMetrics}`} />
        <span className={`${styles.skeleton} ${styles.skeletonBlock}`} />
        {[0, 1, 2, 3].map((row) => (
          <span key={row} className={`${styles.skeleton} ${styles.skeletonRow}`} />
        ))}
      </div>
    </div>
  )
}
