import { buildMonthGrid, getWeekDateKeys, shiftDateKey, toMonthStartKey, parseDateKey } from "./studio-schedule-month"
import type { CalendarView } from "./studio-schedule-url-state"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

export type StudioScheduleRange = { from: string; to: string }
export const getStudioScheduleRange = (view: CalendarView, date: string): StudioScheduleRange => {
  if (!parseDateKey(date)) throw new Error("invalid_schedule_date")
  const dates = view === "month" ? buildMonthGrid(toMonthStartKey(date)).map(cell => cell.key)
    : view === "week" ? getWeekDateKeys(date) : [date]
  return { from: new Date(`${dates[0]}T00:00:00+09:00`).toISOString(),
    to: new Date(`${shiftDateKey(dates[dates.length - 1], 1)}T00:00:00+09:00`).toISOString() }
}

// Requested time is never evidence of a confirmed visit. completed_at/canceled_at
// describe an action, not an appointment, so these belong in a separate record list.
export const getStudioSchedulePlacement = (item: StudioApplicationSummary) => {
  if (item.status === "new" || item.status === "reviewing") {
    return { appointmentAt: item.requestedSlotAt, recordedAt: null }
  }
  const appointmentAt = item.confirmedSlotAt ?? item.confirmedBlockStartAt ?? null
  const recordedAt = item.status === "canceled" ? item.noShowAt ?? item.canceledAt
    : item.status === "completed" ? item.completedAt : null
  return { appointmentAt, recordedAt: recordedAt ?? null }
}
export const isApplicationInScheduleRange = (item: StudioApplicationSummary, range: StudioScheduleRange) => {
  const { appointmentAt, recordedAt } = getStudioSchedulePlacement(item)
  const at = appointmentAt ?? recordedAt
  if (!at) return item.status === "canceled" || item.status === "completed"
  return Date.parse(at) >= Date.parse(range.from) && Date.parse(at) < Date.parse(range.to)
}

/** Bounds are parsed and serialized before interpolation in PostgREST logic. */
export const buildStudioScheduleRangeFilter = (range: StudioScheduleRange) => {
  const from = new Date(range.from).toISOString(), to = new Date(range.to).toISOString()
  const within = (field: string) => `${field}.gte.${from},${field}.lt.${to}`
  const missing = "confirmed_slot_at.is.null,confirmed_schedule_block_id.is.null"
  return [
    `and(status.in.(new,reviewing),${within("requested_slot_at")})`,
    `and(status.in.(confirmed,completed,canceled),${within("confirmed_slot_at")})`,
    `and(status.eq.completed,${missing},${within("completed_at")})`,
    `and(status.eq.canceled,${missing},${within("no_show_at")})`,
    `and(status.eq.canceled,${missing},no_show_at.is.null,${within("canceled_at")})`,
    `and(status.eq.canceled,${missing},no_show_at.is.null,canceled_at.is.null)`,
    `and(status.eq.completed,${missing},completed_at.is.null)`
  ].join(",")
}
