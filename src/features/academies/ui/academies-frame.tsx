import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ReactNode } from "react"
import styles from "../../../../app/academies/page.module.css"

/** 앱 academies.tsx: "학원 둘러보기" 뒤로가기 화면(하단 탭 없음). */
export function AcademiesFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1"><div className={ui.column}>
    <ParentHeader title="학원 둘러보기" backHref="/" />
    <div className={ui.content}>{children}</div>
  </div></ParentAppShell>
}
export function AcademiesSkeleton() {
  return <div className={styles.skeletons} role="status" aria-busy="true" aria-label="학원 목록 불러오는 중">
    {[0, 1, 2, 3].map(key => <div key={key} className={styles.skeletonRow} aria-hidden="true"><span className={ui.skeleton} /><span className={ui.skeleton} /></div>)}
  </div>
}
