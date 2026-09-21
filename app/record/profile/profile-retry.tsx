"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import styles from "./page.module.css"

export function EducationProfileRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <button type="button" className={styles.retry} disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도하기"}</button>
}
