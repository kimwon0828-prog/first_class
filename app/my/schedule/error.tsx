"use client"
import { ScheduleFrame } from "@/features/schedule/ui/parent-schedule-screen"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
export default function Error({ reset }: { reset: () => void }) {
  return <ScheduleFrame><div className={ui.tabContent}><div className={ui.notice} role="alert">
    <p className={ui.body}>일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
    <AppButton variant="secondary" onClick={reset}>다시 시도</AppButton>
  </div></div></ScheduleFrame>
}
