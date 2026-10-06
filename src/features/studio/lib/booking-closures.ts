export type BookingClosure = { id: string; organizationId: string; classId: string | null; dateKey: string; startAt: string; endAt: string; reason: string | null }
export type BookingOccurrence = { key: string; source: "class_schedule" | "schedule_block"; id: string; classId: string; classTitle: string; startAt: string; endAt: string; bookingStatus: "open" | "closed" | "hidden"; capacity: number; reservationIds: string[]; closureIds: string[] }
export type BookingDay = { occurrences: BookingOccurrence[]; closures: BookingClosure[] }
export type BookingClosureMutation = { organizationId: string; dateKey: string; classId: string | null; mode: "close" | "release"; slotKeys: string[]; expectedTargets: string[]; closureIds: string[]; reason: string | null }
export const bookingIntervalsOverlap = (a: Pick<BookingClosure, "startAt" | "endAt">, b: Pick<BookingOccurrence, "startAt" | "endAt">) => Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(a.endAt) > Date.parse(b.startAt)
export function previewBookingClosure(day: BookingDay, keys: string[], classId: string | null, mode: "close" | "release") {
  const selected = day.occurrences.filter(o => keys.includes(o.key) && (!classId || o.classId === classId))
  const ownClosures = day.closures.filter(c => c.classId === classId && selected.some(o => bookingIntervalsOverlap(c,o)))
  const windows = mode === "release" ? ownClosures : selected
  const targets = day.occurrences.filter(o => (!classId || o.classId === classId) && windows.some(w => bookingIntervalsOverlap(w,o)))
  const reservationCount = new Set(targets.flatMap(o => o.reservationIds)).size
  const closeCount = new Set(selected.filter(o => !day.closures.some(c => c.classId === classId && c.startAt === o.startAt && c.endAt === o.endAt)).map(o => `${o.startAt}/${o.endAt}`)).size
  return { selected, targets, reservationCount, closureIds: ownClosures.map(c => c.id), canApply: mode === "close" ? closeCount > 0 : ownClosures.length > 0 }
}
export function groupBookingOccurrences(rows: BookingOccurrence[]) {
  const groups = new Map<string, BookingOccurrence[]>()
  for (const row of rows) { const key = `${row.startAt}/${row.endAt}`; groups.set(key,[...(groups.get(key) ?? []),row]) }
  return [...groups.values()].sort((a,b) => a[0].startAt.localeCompare(b[0].startAt) || a[0].endAt.localeCompare(b[0].endAt))
}
export function mergeBookingClosureRanges(rows: BookingClosure[]) {
  const merged: BookingClosure[] = []
  for (const row of [...rows].sort((a,b)=>a.dateKey.localeCompare(b.dateKey)||String(a.classId).localeCompare(String(b.classId))||a.startAt.localeCompare(b.startAt))) {
    const last=merged[merged.length-1]
    if(last&&last.dateKey===row.dateKey&&last.classId===row.classId&&Date.parse(last.endAt)>=Date.parse(row.startAt))last.endAt=Date.parse(last.endAt)>Date.parse(row.endAt)?last.endAt:row.endAt
    else merged.push({...row})
  }
  return merged
}
