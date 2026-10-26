import { parentEntryHref } from "@/features/classes/lib/parent-navigation"
import { Suspense } from "react"
import { unstable_noStore as noStore } from "next/cache"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { resolveSelectedChildId, toChildSelectorOptions } from "@/features/children/lib/child-selection"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { finishedApplications } from "@/features/schedule/lib/app-schedule"
import { getParentExperienceSignals } from "@/features/record/queries/get-parent-experience-signals"
import { RecordHome, RecordSkeleton } from "@/features/record/ui/record-home"

export const dynamic = "force-dynamic"
export const revalidate = 0
type RecordPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }
export default function RecordPage(props: RecordPageProps) {
  return <Suspense fallback={<RecordSkeleton />}><RecordContent {...props} /></Suspense>
}
async function RecordContent({ searchParams }: RecordPageProps) {
  noStore()
  const params = await searchParams
  await requireParentAccess({ returnTo: parentEntryHref("/record", params) })
  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])
  const selectedChildId = resolveSelectedChildId(typeof params.child === "string" ? params.child : null, children.data)
  // Legacy childId=null belongs only to the all-children view, never matched by name.
  const mine = selectedChildId ? applications.data.filter(item => item.childId === selectedChildId) : applications.data
  // 앱과 같이 완료 처리 전(확정·일정 지남)도 "리포트 준비 중"으로 함께 보인다.
  const experiences = finishedApplications(mine, Date.now())
  const error = children.error ? "children" : applications.error ? "records" : null
  const signals = await getParentExperienceSignals(error ? [] : experiences.filter(item => item.status === "completed"))
  return <RecordHome experiences={experiences} childOptions={toChildSelectorOptions(children.data)} selectedChildId={selectedChildId}
    error={error} signalsFailed={Boolean(signals.error)}
    reportedExperienceIds={signals.error ? undefined : signals.reportedExperienceIds}
    decidedExperienceIds={signals.error ? undefined : signals.decidedExperienceIds} />
}
