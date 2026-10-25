import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ReactNode } from "react"
import styles from "./page.module.css"
/** 신청 현황(앱 my/applications): 뒤로가기 화면, 하단 탭 없음. */
export function ApplicationsFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1"><div className={ui.column}>
    <ParentHeader title="신청 현황" backHref="/my" sticky />
    <div className={ui.content}><p className={`${ui.caption} ${styles.intro}`}>신청한 체험수업과 레벨테스트의 진행 상태를 확인해요.</p>{children}</div>
  </div></ParentAppShell>
}
export function ApplicationsSkeleton() {
  return <AppLoading label="신청 현황 불러오는 중" />
}
