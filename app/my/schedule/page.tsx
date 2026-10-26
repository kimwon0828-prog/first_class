import { parentEntryHref } from "@/features/classes/lib/parent-navigation"
import type { Metadata } from "next"
import { unstable_noStore as noStore } from "next/cache"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { resolveSelectedChildId, toChildSelectorOptions } from "@/features/children/lib/child-selection"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { finishedApplications, scheduledApplications } from "@/features/schedule/lib/app-schedule"
import { getParentExperienceSignals } from "@/features/record/queries/get-parent-experience-signals"
import { ParentScheduleScreen } from "@/features/schedule/ui/parent-schedule-screen"

export const metadata: Metadata = {
  title: "내 일정 | 첫수업",
  description: "예정된 체험수업과 완료된 일정을 날짜 순으로 확인하세요.",
  alternates: { canonical: "/my/schedule" }
}
export const dynamic = "force-dynamic"
export const revalidate = 0

type SchedulePageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> }
export default async function ParentSchedulePage({ searchParams }: SchedulePageProps) {
  noStore()
  const params = await searchParams
  await requireParentAccess({ returnTo: parentEntryHref("/my/schedule", params) })
  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])
  const selectedChildId = resolveSelectedChildId(typeof params?.child === "string" ? params.child : null, children.data)
  const now = Date.now()
  // Legacy childId=null belongs only to the all-children view, never matched by name.
  const mine = selectedChildId ? applications.data.filter(row => row.childId === selectedChildId) : applications.data
  const finished = finishedApplications(mine, now)
  const failed = Boolean(applications.error || children.error)
  const signals = await getParentExperienceSignals(failed ? [] : finished.filter(row => row.status === "completed"))
  return <ParentScheduleScreen upcoming={scheduledApplications(mine, now)} finished={finished} now={now}
    reportedIds={signals.error ? undefined : [...signals.reportedExperienceIds]}
    childOptions={toChildSelectorOptions(children.data)} selectedChildId={selectedChildId} failed={failed} />
}
