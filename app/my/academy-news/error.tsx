"use client"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { AcademyNewsFrame } from "./frame"
export default function ErrorState({ reset }: { reset: () => void }) {
  return <AcademyNewsFrame><div className={ui.notice} role="alert"><p className={ui.body}>내용을 불러오지 못했어요. 다시 시도해 주세요.</p><AppButton variant="secondary" onClick={reset}>다시 시도</AppButton></div></AcademyNewsFrame>
}
