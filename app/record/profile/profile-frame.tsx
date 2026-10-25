import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import type { ReactNode } from "react"
import { withRecordChild } from "@/features/record/lib/record-href"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"

export function EducationProfileFrame({ children, childId }: { children: ReactNode; childId?: string | null }) {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1"><div className={ui.column}>
    <ParentHeader title="교육 프로필" backHref={withRecordChild("/record", childId ?? null)} sticky />
    <div className={ui.content}>{children}</div>
  </div></ParentAppShell>
}

export function EducationProfileSkeleton() {
  return <AppLoading label="교육 프로필 불러오는 중" />
}
