"use client"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { AcademyDetailFrame } from "@/features/academies/ui/academy-detail-frame"
import { AppButton, AppButtonLink, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"

export default function AcademyError({ reset }: { reset: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return <AcademyDetailFrame><section className={styles.state} role="alert">
    <p className={ui.body}>학원 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
    <AppButton variant="secondary" disabled={pending} onClick={() => startTransition(() => { router.refresh(); reset() })}>{pending ? "불러오는 중…" : "다시 시도"}</AppButton>
    <AppButtonLink href="/academies" variant="secondary">학원 목록으로 돌아가기</AppButtonLink>
  </section></AcademyDetailFrame>
}
