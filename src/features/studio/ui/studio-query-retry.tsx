"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import styles from "./application-trial-result-workflow.module.css"
export function StudioQueryRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <button type="button" className={styles.secondaryButton} disabled={pending} onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도하기"}</button>
}
