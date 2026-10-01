"use client"

import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import styles from "./page.module.css"
export default function ErrorState({ reset }: { reset: () => void }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1"><div className={styles.shell}><ParentHeader title="체험 기록" backHref="/record" /><div className={styles.content}>
    <section className={styles.section}><h1 className={styles.sectionTitle}>기록을 불러오지 못했어요.</h1>
      <p className={styles.muted}>잠시 후 다시 시도해 주세요.</p>
      <button className={styles.reportLink} onClick={reset}>다시 시도</button>
    </section>
  </div></div></ParentAppShell>
}
