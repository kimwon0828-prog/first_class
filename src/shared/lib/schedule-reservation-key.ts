/** Same instant, same key; weekly occurrences retain their own date. */
export const buildScheduleOccurrenceReservationKey = (scheduleId: string, startAt: string) => {
  const instant = Date.parse(startAt)
  if (!Number.isFinite(instant) || !/(Z|[+-]\d{2}:\d{2})$/i.test(startAt)) {
    throw new Error("invalid_schedule_occurrence_timestamp")
  }
  return `${scheduleId}::${new Date(instant).toISOString()}`
}
