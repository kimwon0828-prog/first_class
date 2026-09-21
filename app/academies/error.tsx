"use client"
import Link from "next/link"
import { AcademiesFrame } from "@/features/academies/ui/academies-frame"
import styles from "./page.module.css"
export default function AcademiesError({ reset }: { reset: () => void }) {
  return <AcademiesFrame><section className={styles.state} role="alert"><h2>학원 정보를 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p><button className={styles.primaryButton} onClick={reset}>다시 시도하기</button><Link href="/" className={styles.secondaryButton}>홈으로 돌아가기</Link></section></AcademiesFrame>
}
