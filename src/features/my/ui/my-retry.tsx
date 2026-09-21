"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import styles from "./my-hub.module.css"
export function MyRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <button className={styles.retry} type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
    {pending ? "불러오는 중…" : "다시 시도"}
  </button>
}
