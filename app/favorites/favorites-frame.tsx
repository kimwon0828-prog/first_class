import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import type { ReactNode } from "react"
import styles from "./favorites.module.css"
/** 관심수업(앱 favorites): 뒤로가기 화면, 하단 탭 없음. */
export function FavoritesFrame({ children }: { children: ReactNode }) {
  return <ParentAppShell navigation={false} data-parent-design="v1" className={ui.page}><div className={ui.column}>
    <ParentHeader title="관심수업" backHref="/my" />
    <div className={ui.content}><p className={styles.intro}>관심수업은 이 브라우저에 저장돼요.<br /><span>언제든 다시 확인하고 수업을 신청할 수 있어요.</span></p>{children}</div>
  </div></ParentAppShell>
}
export function FavoritesSkeleton() {
  return <AppLoading label="관심수업 불러오는 중" />
}
