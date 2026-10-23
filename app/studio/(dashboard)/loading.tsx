import styles from "./page.module.css"

export default function StudioDashboardLoading() {
  return <div className={styles.page} aria-busy="true" aria-label="Studio 불러오는 중">
    <div className={styles.header}><div className={styles.loadingLine} /></div>
    <div className={styles.hero} aria-hidden="true">
      <div className={styles.loadingHero} />
      <div className={styles.loadingToday} />
    </div>
    <div className={styles.loadingBoard} aria-hidden="true" />
    <p className={styles.loadingNote}>Studio를 불러오고 있어요.</p>
  </div>
}
