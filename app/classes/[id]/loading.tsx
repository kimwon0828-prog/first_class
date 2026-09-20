import styles from "./page.module.css"

export default function ClassDetailLoading() {
  return <main className={styles.page} data-parent-design="v1" aria-busy="true" aria-label="수업 상세 불러오는 중">
    <div className={styles.shell}>
      <div className={styles.topBar}><p className={styles.headerTitle}>수업 상세</p></div>
      <div className={styles.heroSection} aria-hidden="true">
        <div className={styles.imageFrame} />
        <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
        <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
      </div>
      <div className={styles.sections} aria-hidden="true">
        <div className={styles.section}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        <div className={styles.section}><div className={`${styles.skeleton} ${styles.skeletonShort}`} /><div className={styles.skeleton} /></div>
      </div>
    </div>
  </main>
}
