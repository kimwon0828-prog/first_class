"use client"
import Link from "next/link"
import { ChildrenFrame } from "@/features/children/ui/children-frame"
import styles from "./page.module.css"
export default function ChildrenError({ reset }: { reset: () => void }) {
  return <ChildrenFrame><section className={styles.errorState} role="alert">
    <h2 className={styles.stateTitle}>자녀 정보를 불러오지 못했어요.</h2>
    <p className={styles.noticeText}>잠시 후 다시 시도해 주세요.</p>
    <button type="button" className={styles.retryButton} onClick={reset}>다시 시도하기</button>
    <Link href="/my" className={styles.returnLink}>마이페이지로 돌아가기</Link>
  </section></ChildrenFrame>
}
