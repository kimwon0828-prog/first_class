"use client"

import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppButton, appUi as ui } from "@/features/classes/ui/parent-app-ui"
export default function ErrorState({ reset }: { reset: () => void }) {
  return <ParentAppShell navigation={false} className={ui.page}><div className={ui.column}><ParentHeader title="예약 상세" backHref="/record" /><div className={ui.content}>
    <div className={ui.notice} role="alert"><p className={ui.body}>기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p><AppButton variant="secondary" onClick={reset}>다시 시도</AppButton></div>
  </div></div></ParentAppShell>
}
