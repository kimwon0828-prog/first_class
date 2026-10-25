import type { ReactNode } from "react"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"

/** 학원 소식(앱 my/academy-news): 뒤로가기 화면, 하단 탭 없음. 설명 문구는 앱과 같다. */
export function AcademyNewsFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1"><div className={ui.column}>
    <ParentHeader title="학원 소식" backHref="/my" />
    <div className={ui.content}>
      <p className={ui.body} style={{ color: "var(--ink-700)" }}>체험한 학원에 새 반·특강이 열리면 첫수업이 문자로 알려드려요. 광고성 문자예요. 꺼도 체험 신청·일정·리포트 알림은 그대로 받아요.</p>
      {children}
    </div>
  </div></ParentAppShell>
}
