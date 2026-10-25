import { ParentAppShell } from "@/features/classes/ui/parent-app-shell"
import { ParentHeader } from "@/features/classes/ui/parent-header"
import { AppButtonLink, AppNotice, appUi as ui } from "@/features/classes/ui/parent-app-ui"
export default function NotFound() {
  return <ParentAppShell navigation={false} className={ui.page}><div className={ui.column}><ParentHeader title="예약 상세" backHref="/record" /><div className={ui.content}>
    <AppNotice message="신청을 찾을 수 없어요. 기록 목록에서 다시 확인해 주세요."><AppButtonLink href="/record" variant="secondary">기록 목록으로</AppButtonLink></AppNotice>
  </div></div></ParentAppShell>
}
