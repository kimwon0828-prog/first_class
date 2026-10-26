"use client"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { MyFrame } from "./my-frame"
export default function MyError() {
  return <MyFrame><div className={ui.notice} role="alert">
    <p className={ui.body}>마이를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
    <AppButton variant="secondary" onClick={() => window.location.reload()}>다시 시도</AppButton>
  </div></MyFrame>
}
