"use client"
import { ChildrenFrame } from "@/features/children/ui/children-frame"
import { AppButton, AppButtonLink, appUi as ui } from "@/features/classes/ui/parent-app-ui"
export default function ChildrenError({ reset }: { reset: () => void }) {
  return <ChildrenFrame><div className={ui.notice} role="alert">
    <p className={ui.body}>자녀 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
    <AppButton variant="secondary" onClick={reset}>다시 시도</AppButton>
    <AppButtonLink href="/my" variant="secondary">마이로 돌아가기</AppButtonLink>
  </div></ChildrenFrame>
}
