import Link from "next/link"
import styles from "./page.module.css"
export default function NotFound() {
  return <main className={styles.page} data-parent-design="v1"><div className={styles.shell}><div className={styles.content}>
    <section className={styles.section}><h1 className={styles.sectionTitle}>기록을 찾을 수 없어요.</h1>
      <p className={styles.muted}>확인할 수 있는 기록이 없어요. 기록 목록에서 다시 확인해 주세요.</p>
      <Link href="/record" className={styles.reportLink}>기록 목록으로</Link>
    </section>
  </div></div></main>
}
