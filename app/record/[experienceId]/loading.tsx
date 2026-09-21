import styles from "./page.module.css"
export default function Loading() {
  return <main className={styles.page} data-parent-design="v1" aria-busy="true" aria-label="체험 기록 불러오는 중">
    <div className={styles.shell}><header className={styles.header}><h1 className={styles.headerTitle}>체험 기록</h1></header>
      <div className={styles.content}>{[0, 1, 2].map(key => <div key={key} className={styles.skeleton} aria-hidden="true" />)}</div>
    </div>
  </main>
}
