import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"

export default function ClassApplyLoading() {
  return <ParentAppShell navigation={false} className={ui.page}>
    <div className={ui.column}>
      <ParentHeader title="체험수업 신청" backHref="/classes" />
      <div className={ui.content} aria-busy="true"><AppLoading label="신청 정보 확인 중" /></div>
    </div>
  </ParentAppShell>
}
