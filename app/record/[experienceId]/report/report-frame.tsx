import Link from "next/link"
import type { ReactNode } from "react"
import styles from "./page.module.css"

export function ReportFrame({ children, backHref }: { children: ReactNode; backHref?: string }) {
  return (
    <main className={styles.page} data-parent-design="v1">
      <div className={styles.shell}>
        <header className={styles.header}>
          {backHref ? <Link href={backHref} className={styles.back} aria-label="체험 기록으로 돌아가기"><span aria-hidden="true">←</span></Link> : null}
          <h1 className={styles.title}>체험 리포트</h1>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </main>
  )
}
