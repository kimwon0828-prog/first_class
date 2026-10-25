import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ReactNode } from "react"
/** 알림(앱 notifications): 뒤로가기 화면, 하단 탭 없음. */
export function NotificationsFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell className={ui.page} data-parent-design="v1" navigation={false}><div className={ui.column}><ParentHeader title="알림" backHref="/" /><div className={ui.content}>{children}</div></div></ParentAppShell>
}
