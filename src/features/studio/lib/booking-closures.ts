export type BookingClosure = { id: string; organizationId: string; classId: string | null; dateKey: string; startAt: string; endAt: string; reason: string | null; selectionScope?: "public" | "class" | null }
export type BookingOccurrence = { key: string; source: "class_schedule" | "schedule_block"; id: string; classId: string; classTitle: string; startAt: string; endAt: string; bookingStatus: "open" | "closed" | "hidden"; capacity: number; reservationIds: string[]; closureIds: string[] }
export type BookingClass = { id: string; title: string; isActive: boolean; archivedAt?: string | null }
export type BookingDay = { occurrences: BookingOccurrence[]; closures: BookingClosure[]; classes: BookingClass[]; applicationHistoryKeys: string[] }
export const emptyBookingDay = (): BookingDay => ({ occurrences: [], closures: [], classes: [], applicationHistoryKeys: [] })
// Existing Lifecycle/Parent contract. Availability restrictions are a separate axis.
const isPublicClass = (klass: Pick<BookingClass, "isActive" | "archivedAt">) => klass.isActive && !klass.archivedAt
export function withBookingClassHistory(day: Pick<BookingDay, "occurrences" | "closures">, classes: BookingClass[], applications: Array<{ classId: string; requestedSlotAt: string | null; confirmedSlotAt?: string | null; confirmedBlockStartAt?: string | null }>): BookingDay {
  const historyTimes = new Set<string>()
  for (const a of applications) for (const at of [a.requestedSlotAt, a.confirmedSlotAt, a.confirmedBlockStartAt]) if (at) historyTimes.add(`${a.classId}/${Date.parse(at)}`)
  return { ...day, classes, applicationHistoryKeys: day.occurrences.filter(o => historyTimes.has(`${o.classId}/${Date.parse(o.startAt)}`)).map(o => o.key) }
}
// Preserve raw occurrences for existing bookings and legacy closure release.
export function visibleBookingOccurrences(day: BookingDay) {
  const publicIds = new Set(day.classes.filter(isPublicClass).map(c => c.id))
  const history = new Set(day.applicationHistoryKeys)
  return day.occurrences.filter(o => publicIds.has(o.classId) || o.reservationIds.length > 0 || history.has(o.key) || o.closureIds.length > 0)
}
export function bookingClassOptions(day: BookingDay) {
  const rows = visibleBookingOccurrences(day), ids = new Set([...rows.map(o => o.classId), ...day.closures.flatMap(c => c.classId ? [c.classId] : [])])
  return [...ids].map(id => ({ value: id, label: day.classes.find(c => c.id === id)?.title ?? rows.find(o => o.classId === id)?.classTitle ?? "수업 정보 없음" }))
}
export function visibleScheduleClassOptions<T extends { value: string; label: string; isActive?: boolean; archivedAt?: string | null }>(options: T[], applicationClassIds: string[], closures: BookingClosure[]) {
  const retained = new Set([...applicationClassIds, ...closures.flatMap(c => c.classId ? [c.classId] : [])])
  return options.filter(c => c.value === "all" || (c.isActive === true && !c.archivedAt) || retained.has(c.value))
}
export type BookingClosureMutation = { organizationId: string; dateKey: string; classId: string | null; mode: "close" | "release"; slotKeys: string[]; expectedTargets: string[]; closureIds: string[]; reason: string | null }
export const bookingIntervalsOverlap = (a: Pick<BookingClosure, "startAt" | "endAt">, b: Pick<BookingOccurrence, "startAt" | "endAt">) => Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(a.endAt) > Date.parse(b.startAt)
export const bookingClosureScopeLabel = (c: BookingClosure) => !c.classId ? "기존 학원 전체 마감" : c.selectionScope === "public" ? "전체 공개 과정에서 적용" : "과정별 마감"
export function bookingReleaseTargets(day: BookingDay, closures: BookingClosure[]) {
  return day.occurrences.filter(o => closures.some(c => (!c.classId || c.classId === o.classId) && bookingIntervalsOverlap(c,o)))
}
export function previewBookingClosure(day: BookingDay, keys: string[], classId: string | null, mode: "close" | "release") {
  const publicIds = new Set(day.classes.filter(isPublicClass).map(c => c.id))
  const selected = day.occurrences.filter(o => keys.includes(o.key) && (!classId || o.classId === classId) && (mode === "release" || publicIds.has(o.classId)))
  const ownClosures = day.closures.filter(c => (!classId || c.classId === classId) && selected.some(o => (!c.classId || c.classId === o.classId) && bookingIntervalsOverlap(c,o)))
  const targets = mode === "release" ? bookingReleaseTargets(day,ownClosures) : day.occurrences.filter(o => publicIds.has(o.classId) && (!classId || o.classId === classId) && selected.some(w => bookingIntervalsOverlap(w,o)))
  const reservationCount = new Set(targets.flatMap(o => o.reservationIds)).size
  const canClose = targets.some(o => selected.some(w => bookingIntervalsOverlap(w,o) && !day.closures.some(c => c.classId === o.classId && Date.parse(c.startAt) === Date.parse(w.startAt) && Date.parse(c.endAt) === Date.parse(w.endAt))))
  return { selected, targets, reservationCount, closureIds: ownClosures.map(c => c.id), canApply: mode === "close" ? canClose : ownClosures.length > 0 }
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
    if(last&&last.dateKey===row.dateKey&&last.classId===row.classId&&last.selectionScope===row.selectionScope&&Date.parse(last.endAt)>=Date.parse(row.startAt))last.endAt=Date.parse(last.endAt)>Date.parse(row.endAt)?last.endAt:row.endAt
    else merged.push({...row})
  }
  return merged
}
