import type { ReactNode } from "react"
import { AppIcon } from "@/features/classes/ui/app-icon"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentBackLink } from "@/features/classes/ui/parent-back-link"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "../../../../app/academy/[handle]/page.module.css"

/** 학원 상세의 불러오는 중 · 오류 · 없음 화면 틀(앱: 대표 이미지 자리 없이 뒤로 버튼 + 본문). */
export function AcademyDetailFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell navigation={false} className={ui.page} data-parent-design="v1"><div className={ui.column}>
    <div className={styles.stateTop}><ParentBackLink href="/academies" preferHistory label="뒤로가기" className={ui.circle}><AppIcon name="chevron-left" size={22} /></ParentBackLink></div>
    <div className={ui.content}>{children}</div>
  </div></ParentAppShell>
}
