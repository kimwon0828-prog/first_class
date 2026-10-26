import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ReactNode } from "react"

/** 체험 리포트 틀: 뒤로가기 화면(하단 탭 없음), 하단 고정 바는 "학원 보기". */
export function ReportFrame({ children, backHref, footer }: { children: ReactNode; backHref?: string; footer?: ReactNode }) {
  return (
    <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1">
      <div className={ui.column}>
        <ParentHeader title="체험 리포트" backHref={backHref ?? "/record"} sticky />
        <div className={`${ui.content} ${footer ? ui.withFooter : ""}`}>{children}</div>
      </div>
      {footer ? <div className={ui.footer}>{footer}</div> : null}
    </ParentAppShell>
  )
}
