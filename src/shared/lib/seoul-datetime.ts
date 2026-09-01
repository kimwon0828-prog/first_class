export const SEOUL_TIME_ZONE = "Asia/Seoul"

const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const SEOUL_DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const SEOUL_WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
}
const SEOUL_WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일"
] as const

export type SeoulDateTimeParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
}

const getLocalDateTimeParts = (value: string) => {
  if (!SEOUL_DATETIME_LOCAL_RE.test(value)) {
    return null
  }

  const [datePart, timePart] = value.split("T")
  const [yearText, monthText, dayText] = datePart.split("-")
  const [hourText, minuteText] = timePart.split(":")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    return null
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute))
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day ||
    utcDate.getUTCHours() !== hour ||
    utcDate.getUTCMinutes() !== minute
  ) {
    return null
  }

  return { year, month, day, hour, minute }
}

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value))

export const getSeoulDateTimeParts = (value: string | Date): SeoulDateTimeParts | null => {
  const date = toDate(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone: SEOUL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

  const year = Number(parts.year)
  const month = Number(parts.month)
  const day = Number(parts.day)
  const hour = Number(parts.hour)
  const minute = Number(parts.minute)
  const weekday = SEOUL_WEEKDAY_INDEX[parts.weekday ?? ""]

  if ([year, month, day, hour, minute, weekday].some((part) => !Number.isInteger(part))) {
    return null
  }

  return { year, month, day, hour, minute, weekday }
}

export const parseSeoulDateTimeLocalToIso = (value: string) => {
  const parts = getLocalDateTimeParts(value.trim())
  if (!parts) {
    return null
  }

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - SEOUL_OFFSET_MS
  ).toISOString()
}

export const buildSeoulOccurrenceRange = (dateText: string, startTime: string, endTime: string) => {
  const startAt = parseSeoulDateTimeLocalToIso(`${dateText}T${startTime}`)
  const endAt = parseSeoulDateTimeLocalToIso(`${dateText}T${endTime}`)

  if (!startAt || !endAt || new Date(endAt) <= new Date(startAt)) {
    return null
  }

  return { startAt, endAt }
}

type RequestedClassScheduleOccurrenceInput = {
  requestedSlotAt: string
  startTime: string
  endTime: string
}

export type RequestedClassScheduleOccurrence = {
  startAt: string
  endAt: string
}

const formatTimeText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length >= 5 ? trimmed.slice(0, 5) : trimmed
}

/**
 * 신청된 requested_slot_at 이 수업 일정(class_schedules)의 실제 occurrence 인지 검증한다.
 *
 * 서울 벽시계 기준 시각이 일정의 start_time 과 정확히 같아야 통과한다.
 * 어긋나면 보정하지 않고 null 을 돌려준다 — 호출부가 validation error 를 낸다.
 * (2026-09-01 backfill migration 으로 legacy UTC-local 값은 production 에서 0건이 되었다.
 *  런타임에서 과거 값을 추측 복구하지 않는다.)
 */
export const resolveRequestedClassScheduleOccurrence = (
  input: RequestedClassScheduleOccurrenceInput
): RequestedClassScheduleOccurrence | null => {
  const requestedStart = new Date(input.requestedSlotAt)
  if (Number.isNaN(requestedStart.getTime())) {
    return null
  }

  const startTimeText = formatTimeText(input.startTime)
  const endTimeText = formatTimeText(input.endTime)
  const startHour = Number(startTimeText.slice(0, 2))
  const startMinute = Number(startTimeText.slice(3, 5))
  const endHour = Number(endTimeText.slice(0, 2))
  const endMinute = Number(endTimeText.slice(3, 5))

  if ([startHour, startMinute, endHour, endMinute].some((value) => Number.isNaN(value))) {
    return null
  }

  const durationMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute)
  if (durationMinutes <= 0) {
    return null
  }

  const seoulStart = getSeoulDateTimeParts(requestedStart)
  if (!seoulStart || seoulStart.hour !== startHour || seoulStart.minute !== startMinute) {
    return null
  }

  return {
    startAt: input.requestedSlotAt,
    endAt: new Date(requestedStart.getTime() + durationMinutes * 60 * 1000).toISOString()
  }
}

export const formatSeoulDateKey = (value: string | Date) => {
  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return null
  }

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

export const formatSeoulOccurrenceLabel = (startAt: string, endAt: string) => {
  const start = getSeoulDateTimeParts(startAt)
  const end = getSeoulDateTimeParts(endAt)
  if (!start || !end) {
    return null
  }

  const dateText = `${start.year}.${String(start.month).padStart(2, "0")}.${String(start.day).padStart(2, "0")}`
  const startTimeText = `${String(start.hour).padStart(2, "0")}:${String(start.minute).padStart(2, "0")}`
  const endTimeText = `${String(end.hour).padStart(2, "0")}:${String(end.minute).padStart(2, "0")}`

  return `${dateText} ${SEOUL_WEEKDAY_LABELS[start.weekday]} ${startTimeText}~${endTimeText}`
}

export const formatSeoulDateTimeInputValue = (value: string | null | undefined) => {
  if (!value) {
    return ""
  }

  const parts = getSeoulDateTimeParts(value)
  if (!parts) {
    return ""
  }

  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${String(
    parts.hour
  ).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`
}

export const formatSeoulDateTime = (
  value: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
}
