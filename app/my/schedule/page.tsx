import type { Metadata } from "next"
import { unstable_noStore as noStore } from "next/cache"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { resolveSelectedChildId, toChildSelectorOptions } from "@/features/children/lib/child-selection"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { buildScheduleView } from "@/features/schedule/lib/schedule-view"
import { ParentScheduleScreen } from "@/features/schedule/ui/parent-schedule-screen"
import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"

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
  await requireParentAccess({ returnTo: "/my/schedule" })
  const [applications, children] = await Promise.all([getMyApplications(), getMyChildren()])
  const params = await searchParams
  const selectedChildId = resolveSelectedChildId(typeof params?.child === "string" ? params.child : null, children.data)
  const now = new Date()
  return <ParentScheduleScreen model={buildScheduleView(applications.data, selectedChildId, now.getTime())}
    childOptions={toChildSelectorOptions(children.data)} selectedChildId={selectedChildId}
    today={formatSeoulDateKey(now)!} failed={Boolean(applications.error || children.error)} />
}
