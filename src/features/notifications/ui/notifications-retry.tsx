"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import styles from "../../../../app/notifications/page.module.css"
export function NotificationsRetry({ reset }: { reset?: () => void }) {
 const router = useRouter()
 const [pending, startTransition] = useTransition()
 return <section className={styles.state} role="alert"><h2>알림을 불러오지 못했어요.</h2><p>잠시 후 다시 시도해주세요.</p><button type="button" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset?.() })}>{pending ? "불러오는 중…" : "다시 시도하기"}</button></section>
}
