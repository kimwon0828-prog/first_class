import styles from "./page.module.css"

export default function StudioCasesLoading() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="상담·등록 목록 불러오는 중">
      <header className={styles.header} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.skeletonTitle}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonSubtitle}`} />
      </header>
      <div className={styles.tabs} aria-hidden="true">
        {[0, 1].map((tab) => <span key={tab} className={`${styles.skeletonLine} ${styles.skeletonTab}`} />)}
      </div>
      <div className={styles.toolbar} aria-hidden="true">
        <span className={`${styles.skeletonLine} ${styles.skeletonFilters}`} />
        <span className={`${styles.skeletonLine} ${styles.skeletonSearch}`} />
      </div>
      <div className={styles.workspace} aria-hidden="true">
        <div className={styles.resultHeader}><span className={`${styles.skeletonLine} ${styles.skeletonSubtitle}`} /></div>
        <div className={styles.tableSurface}>
          <div className={styles.listHead}>{[0, 1, 2, 3, 4, 5].map((cell) => <span key={cell} className={styles.skeletonLine} />)}<span /></div>
          <ul className={styles.list}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
              <li key={row} className={styles.row}>
                <div className={`${styles.rowLink} ${styles.skeletonRow}`}>
                  {[0, 1, 2, 3, 4, 5].map((cell) => <span key={cell} className={styles.skeletonCell}><span className={styles.skeletonLine} /><span className={styles.skeletonLine} /></span>)}<span />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
