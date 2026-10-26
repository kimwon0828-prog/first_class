"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppButton } from "@/features/classes/ui/parent-app-ui"
export function RecordRetry() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <AppButton variant="secondary" disabled={pending} aria-busy={pending}
    onClick={() => startTransition(() => router.refresh())}>{pending ? "불러오는 중" : "다시 시도"}</AppButton>
}
