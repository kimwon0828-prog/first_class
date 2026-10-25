import { ParentHeader } from "@/features/classes/ui/parent-header"
import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { AppLoading, appUi as ui } from "@/features/classes/ui/parent-app-ui"
export default function Loading() {
  return <ParentAppShell navigation={false} className={ui.page} aria-busy="true" aria-label="체험 기록 불러오는 중">
    <div className={ui.column}><ParentHeader title="예약 상세" backHref="/record" /><div className={ui.content}><AppLoading /></div></div>
  </ParentAppShell>
}
