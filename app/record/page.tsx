import { Suspense } from "react"
import { unstable_noStore as noStore } from "next/cache"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { resolveSelectedChildId, toChildSelectorOptions } from "@/features/children/lib/child-selection"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { selectCompletedExperiences } from "@/features/applications/lib/parent-application-split"
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
  await requireParentAccess({ returnTo: "/record" })
  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])
  const params = await searchParams
  const selectedChildId = resolveSelectedChildId(typeof params.child === "string" ? params.child : null, children.data)
  const completed = selectCompletedExperiences(applications.data)
  // Legacy childId=null belongs only to the all-children view, never matched by name.
  const experiences = selectedChildId ? completed.filter(item => item.childId === selectedChildId) : completed
  const error = children.error ? "children" : applications.error ? "records" : null
  const signals = await getParentExperienceSignals(error ? [] : experiences)
  return <RecordHome experiences={experiences} childOptions={toChildSelectorOptions(children.data)} selectedChildId={selectedChildId}
    error={error} signalsFailed={Boolean(signals.error)}
    reportedExperienceIds={signals.error ? undefined : signals.reportedExperienceIds}
    decidedExperienceIds={signals.error ? undefined : signals.decidedExperienceIds} />
}
