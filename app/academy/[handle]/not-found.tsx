import Link from "next/link"
import { AcademyDetailFrame, AcademyIcon } from "@/features/academies/ui/academy-detail-frame"
import styles from "./page.module.css"
export default function AcademyNotFound() {
  return <AcademyDetailFrame><section className={styles.state}><span className={styles.fallback}><AcademyIcon /></span><h1>해당 학원을 찾을 수 없어요.</h1><p>주소가 올바른지 확인해 주세요.</p><Link href="/academies" className={styles.primary}>학원 목록으로 돌아가기</Link></section></AcademyDetailFrame>
}
