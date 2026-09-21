"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import styles from "../../../../app/record/page.module.css"
export function RecordRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <button type="button" className={styles.primaryButton} disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중" : "다시 시도"}</button>
}
