import type { ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"
import { resolveParentExperienceDate } from "@/features/record/lib/experience-view"
import { selectUpcomingConfirmedExperiences } from "./parent-schedule"

export type ScheduleCard = {
  id: string
  startAt: string
  dateKey: string
  title: string | null
  academy: string | null
  address: string | null
  childName: string
  href: string
}
export type ScheduleMonth = { key: string; label: string; items: ScheduleCard[] }

function cards(rows: readonly ParentApplicationSummary[], completed: boolean): ScheduleCard[] {
  return rows.flatMap((row) => {
    const startAt = completed ? resolveParentExperienceDate(row) : row.confirmedSlotAt
    const dateKey = startAt ? formatSeoulDateKey(startAt) : null
    if (!startAt || !dateKey) return []
    return [{ id: row.id, startAt, dateKey, title: row.classTitle, academy: row.academyName,
      address: row.organizationAddress, childName: row.childName, href: `/record/${row.id}` }]
  })
}

/** Parent-safe rows only. Child identity is an owned ID, never a name match. */
export function buildScheduleView(rows: readonly ParentApplicationSummary[], childId: string | null, now: number) {
  const scoped = childId ? rows.filter((row) => row.childId === childId) : rows
  const upcoming = cards(selectUpcomingConfirmedExperiences(scoped, now), false)
  // no_show is canceled in the existing domain; neither tab reclassifies it as completed.
  const completed = cards(scoped.filter((row) => row.status === "completed" && !row.canceledAt), true)
    .sort((a, b) => Date.parse(b.startAt) - Date.parse(a.startAt) || a.id.localeCompare(b.id))
  return { upcoming, completed }
}

/** Input is already sorted by the tab's datetime direction. Include year across year boundaries. */
export function groupScheduleMonths(items: readonly ScheduleCard[]): ScheduleMonth[] {
  const groups = new Map<string, ScheduleMonth>()
  for (const item of items) {
    const key = item.dateKey.slice(0, 7)
    if (!groups.has(key)) groups.set(key, { key, label: `${key.slice(0, 4)}년 ${Number(key.slice(5))}월`, items: [] })
    groups.get(key)!.items.push(item)
  }
  return [...groups.values()]
}
