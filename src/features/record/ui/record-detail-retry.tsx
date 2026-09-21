"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
export function RecordDetailRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <button type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())} style={{ minHeight: 44, color: "var(--brand-700)", background: "transparent", border: 0, cursor: "pointer" }}>{pending ? "불러오는 중…" : "다시 시도"}</button>
}
