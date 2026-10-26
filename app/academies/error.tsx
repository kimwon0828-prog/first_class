"use client"
import { AcademiesFrame } from "@/features/academies/ui/academies-frame"
import { AppButton, AppButtonLink, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import styles from "./page.module.css"

export default function AcademiesError({ reset }: { reset: () => void }) {
  return <AcademiesFrame><section className={styles.state} role="alert">
    <p className={ui.body}>학원 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
    <AppButton variant="secondary" onClick={reset}>다시 시도</AppButton>
    <AppButtonLink href="/" variant="secondary">홈으로 돌아가기</AppButtonLink>
  </section></AcademiesFrame>
}
