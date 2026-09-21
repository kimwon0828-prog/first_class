"use client"
import styles from "./page.module.css"
export default function ErrorState({ reset }: { reset: () => void }) {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}><div className={styles.content}>
    <section className={styles.section}><h1 className={styles.sectionTitle}>기록을 불러오지 못했어요.</h1>
      <p className={styles.muted}>잠시 후 다시 시도해 주세요.</p>
      <button className={styles.reportLink} onClick={reset}>다시 시도</button>
    </section>
  </div></div></main>
}
