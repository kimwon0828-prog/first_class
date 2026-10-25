import type { Metadata } from "next"
import { unstable_noStore as noStore } from "next/cache"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyAcademyNewsConsentAction } from "@/features/marketing-consent/actions/set-academy-news-consent"
import { AcademyNewsSettings } from "@/features/marketing-consent/ui/academy-news-settings"
import { MyRetry } from "@/features/my/ui/my-retry"
import { appUi as ui } from "@/features/classes/ui/parent-app-ui"
import { AcademyNewsFrame } from "./frame"

export const metadata: Metadata = { title: "학원 소식 | 첫수업", alternates: { canonical: "/my/academy-news" } }
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function AcademyNewsPage() {
  noStore()
  await requireParentAccess({ returnTo: "/my/academy-news" })
  const consent = await getMyAcademyNewsConsentAction()
  return <AcademyNewsFrame>
    {consent.ok ? <AcademyNewsSettings initial={consent.data} />
      : <div className={ui.notice} role="alert"><p className={ui.body}>내용을 불러오지 못했어요. 다시 시도해 주세요.</p><MyRetry /></div>}
  </AcademyNewsFrame>
}
