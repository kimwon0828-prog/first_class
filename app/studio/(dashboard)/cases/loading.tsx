import styles from "./page.module.css"

export default function StudioCasesLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="신청 목록 불러오는 중">
      <div aria-hidden="true">
        <span className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <span className={`${styles.skeleton} ${styles.skeletonText}`} style={{ marginTop: 8 }} />
      </div>
      <span className={`${styles.skeleton} ${styles.skeletonChips}`} aria-hidden="true" />
      <div aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((row) => (
          <span key={row} className={`${styles.skeleton} ${styles.skeletonRow}`} />
        ))}
      </div>
    </div>
  )
}
