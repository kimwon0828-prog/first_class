import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import styles from "../../../../app/notifications/page.module.css"
export function NotificationsFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell className={styles.page} data-parent-design="v1" navigation={false}><div className={styles.shell}><ParentHeader title="알림" backHref="/" /><div className={styles.content}>{children}</div></div></ParentAppShell>
}
