"use client"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import styles from "./page.module.css"
export function ProfileFailure({ reload = false }: { reload?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <section className={styles.state} role="alert"><h2>내 정보를 불러오지 못했어요.</h2><p>잠시 후 다시 시도해 주세요.</p><button type="button" disabled={pending} aria-busy={pending} onClick={() => reload ? window.location.reload() : startTransition(() => router.refresh())}>{pending ? "불러오는 중…" : "다시 시도하기"}</button></section>
}
