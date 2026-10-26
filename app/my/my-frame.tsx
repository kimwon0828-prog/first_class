import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { NotificationBell } from "@/features/notifications/ui/notification-indicator"
import { TabHeader, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import Link from "next/link"
import type { ReactNode } from "react"
import styles from "./page.module.css"

/** 마이 탭(앱 (tabs)/my): 큰 제목 "마이" + 알림(읽지 않은 알림 점). */
export function MyFrame({ children, unread = false }: { children: ReactNode; unread?: boolean }) {
  return <ParentAppShell className={ui.page} data-parent-design="v1">
    <div className={ui.column}>
      <TabHeader title="마이"><Link href="/notifications" className={styles.notification} aria-label={unread ? "알림, 읽지 않은 알림이 있음" : "알림"}><NotificationBell hasUnreadNotifications={unread} /></Link></TabHeader>
      <div className={ui.tabContent}>{children}</div>
    </div>
  </ParentAppShell>
}
