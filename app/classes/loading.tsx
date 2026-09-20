import homeStyles from "../page.module.css"
import styles from "./page.module.css"

export default function ClassesLoading() {
  return <main className={homeStyles.page} data-parent-design="v1" aria-busy="true" aria-label="수업 목록 불러오는 중">
    <div className={homeStyles.shell}>
      <h1 className={styles.searchTitle}>수업찾기</h1>
      <p className={homeStyles.srOnly} role="status">수업을 불러오는 중이에요.</p>
      <div className={styles.content} aria-hidden="true">
        <div className={`${styles.skeleton} ${styles.skeletonControl}`} />
        <div className={`${styles.skeleton} ${styles.skeletonControl}`} />
        <div className={`${styles.skeleton} ${styles.skeletonSubjects}`} />
        {[0, 1].map((key) => <div className={styles.skeletonCard} key={key}>
          <div className={styles.skeletonImage} />
          <div className={styles.skeletonBody}>{[0, 1, 2, 3].map((line) => <div className={styles.skeletonLine} key={line} />)}</div>
        </div>)}
      </div>
    </div>
  </main>
}
