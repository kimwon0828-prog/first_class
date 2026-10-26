import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ReactNode } from "react"

/** 자녀 관리(앱 my/children): 뒤로가기 화면, 하단 탭 없음. */
export function ChildrenFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1">
    <div className={ui.column}>
      <ParentHeader title="자녀 관리" backHref="/my" sticky />
      <div className={ui.content}>{children}</div>
    </div>
  </ParentAppShell>
}

export function ChildrenSkeleton() {
  return <AppLoading label="자녀 정보를 불러오는 중" />
}
