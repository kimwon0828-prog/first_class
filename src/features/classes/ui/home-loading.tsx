import styles from "../../../../app/page.module.css"

export function HomeLoading() {
  return (
    <main className={styles.page} data-parent-design="v1" aria-busy="true" aria-label="홈 불러오는 중">
      <div className={styles.shell}>
        <span className={styles.srOnly} role="status">홈을 불러오고 있어요.</span>
        <div aria-hidden="true">
          <div className={`${styles.skeleton} ${styles.skeletonHeader}`} />
          <div className={`${styles.skeleton} ${styles.skeletonHeader}`} />
          <div className={`${styles.skeleton} ${styles.skeletonHeader}`} />
          <div className={styles.content}>
            <div className={`${styles.skeleton} ${styles.skeletonCategories}`} />
            <div className={styles.homeCardRail}>
              {[0, 1].map((key) => <div key={key} className={`${styles.homeCardItem} ${styles.skeleton} ${styles.skeletonCard}`} />)}
            </div>
            <div className={`${styles.skeleton} ${styles.skeletonAcademy}`} />
          </div>
        </div>
      </div>
    </main>
  )
}
