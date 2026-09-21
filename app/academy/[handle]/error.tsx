"use client"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AcademyDetailFrame } from "@/features/academies/ui/academy-detail-frame"
import styles from "./page.module.css"
export default function AcademyError({ reset }: { reset: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <AcademyDetailFrame><section className={styles.state} role="alert"><h1>학원 정보를 불러오지 못했어요.</h1><p>잠시 후 다시 시도해 주세요.</p><button type="button" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset() })} className={styles.primary}>다시 시도하기</button><Link href="/academies" className={styles.secondary}>학원 목록으로 돌아가기</Link></section></AcademyDetailFrame>
}
