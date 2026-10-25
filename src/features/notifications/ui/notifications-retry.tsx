"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
export function NotificationsRetry({ reset }: { reset?: () => void }) {
 const router = useRouter()
 const [pending, startTransition] = useTransition()
 return <div className={ui.notice} role="alert"><p className={ui.body}>알림을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><AppButton variant="secondary" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset?.() })}>{pending ? "불러오는 중…" : "다시 시도"}</AppButton></div>
}
