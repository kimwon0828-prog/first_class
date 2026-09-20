import { resolveSelectedChildId } from "@/features/children/lib/child-selection"
import { isChildEligibleForClass } from "@/shared/constants/grade-options"
import { isBookablePublicSlot } from "@/features/applications/lib/public-class-slots"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts, type SeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
const time = (parts: SeoulDateTimeParts) =>
  `${parts.hour < 12 ? "오전" : "오후"} ${parts.hour % 12 || 12}:${String(parts.minute).padStart(2, "0")}`

/** Reuse the application predicate; compare instants, including mixed UTC offsets. */
export function selectEarliestDetailSlot(slots: readonly AvailableScheduleSlot[], now: number) {
  return slots.filter((slot) => isBookablePublicSlot(slot, now))
    .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))[0]
}

/** Concrete occurrence in Seoul time; the sheet retains the full schedule selection. */
export function formatDetailSchedule(slot: AvailableScheduleSlot | undefined) {
  if (!slot) return null
  const start = getSeoulDateTimeParts(slot.startAt)
  const end = getSeoulDateTimeParts(slot.endAt)
  if (!start) return null
  const minutes = (Date.parse(slot.endAt) - Date.parse(slot.startAt)) / 60000
  const hasEnd = end && Number.isFinite(minutes) && minutes > 0
  const endDate = end && (start.year !== end.year || start.month !== end.month || start.day !== end.day)
    ? `${end.month}월 ${end.day}일 ` : ""
  return {
    dateLabel: `${start.year}년 ${start.month}월 ${start.day}일 (${weekdays[start.weekday]})`,
    timeLabel: [
      `${time(start)}${hasEnd ? ` ~ ${endDate}${time(end)}` : ""}`,
      hasEnd && Number.isInteger(minutes) ? `${minutes}분` : null].filter(Boolean).join(" · ")
  }
}

type EligibilityChild = { id: string; name: string; grade: string }
type DetailEligibility =
  | { kind: "hidden" }
  | { kind: "single"; child: EligibilityChild; eligible: boolean }
  | { kind: "multiple"; children: EligibilityChild[] }
  | { kind: "none" }

/** Read-only summary. Never selects an application child or modifies URL context. */
export function resolveDetailEligibility(
  children: readonly EligibilityChild[], requestedChild: string | null | undefined, targetAge: string
): DetailEligibility {
  if (requestedChild?.trim()) {
    const ownedId = resolveSelectedChildId(requestedChild, children)
    const child = children.find((item) => item.id === ownedId)
    return child ? { kind: "single", child, eligible: isChildEligibleForClass(child.grade, targetAge) }
      : { kind: "hidden" }
  }
  if (!children.length) return { kind: "hidden" }
  const eligible = children.filter((child) => isChildEligibleForClass(child.grade, targetAge))
  if (!eligible.length) return { kind: "none" }
  if (eligible.length === 1) return { kind: "single", child: eligible[0], eligible: true }
  return { kind: "multiple", children: eligible }
}
