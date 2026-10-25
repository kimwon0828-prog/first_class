import { AcademyDetailFrame } from "@/features/academies/ui/academy-detail-frame"
import { AppButtonLink, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"

export default function AcademyNotFound() {
  return <AcademyDetailFrame><section className={styles.state}>
    <p className={ui.body}>학원 정보를 찾을 수 없어요. 주소가 올바른지 확인해 주세요.</p>
    <AppButtonLink href="/academies" variant="secondary">학원 목록으로 돌아가기</AppButtonLink>
  </section></AcademyDetailFrame>
}
