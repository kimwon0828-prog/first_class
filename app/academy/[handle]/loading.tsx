import { AcademyDetailFrame } from "@/features/academies/ui/academy-detail-frame"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"

export default function AcademyLoading() {
  return <AcademyDetailFrame>
    <div className={styles.skeletonStack} aria-hidden="true">
      <div className={`${ui.skeleton} ${styles.skeletonTitle}`} />
      {[0, 1].map(item => <div key={item} className={`${ui.skeleton} ${styles.skeletonCard}`} />)}
    </div>
    <AppLoading label="학원 정보 불러오는 중" />
  </AcademyDetailFrame>
}
