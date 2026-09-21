import { AcademyDetailFrame } from "@/features/academies/ui/academy-detail-frame"
import styles from "./page.module.css"
export default function AcademyLoading() {
  return <AcademyDetailFrame><div className={styles.skeletons} role="status" aria-label="학원 정보 불러오는 중" aria-busy="true"><div className={styles.skeletonHeading} />{[0, 1, 2].map(item => <div key={item} className={styles.skeletonCard} aria-hidden="true" />)}</div></AcademyDetailFrame>
}
