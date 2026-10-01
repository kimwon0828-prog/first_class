import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "./page.module.css"

export function ReportFrame({ children, backHref }: { children: ReactNode; backHref?: string }) {
  return (
    <ParentAppShell className={styles.page} data-parent-design="v1">
      <div className={styles.shell}>
        <ParentHeader title="체험 리포트" backHref={backHref ?? "/record"} sticky />
        <div className={styles.content}>{children}</div>
      </div>
    </ParentAppShell>
  )
}
