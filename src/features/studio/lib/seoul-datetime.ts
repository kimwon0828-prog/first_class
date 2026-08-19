const SEOUL_TIME_ZONE = "Asia/Seoul"
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000
const SEOUL_DATETIME_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const getDateTimeParts = (value: string) => {
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

export const parseSeoulDateTimeLocalToIso = (value: string) => {
  const parts = getDateTimeParts(value.trim())
  if (!parts) {
    return null
  }

  return new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - SEOUL_OFFSET_MS
  ).toISOString()
}

export const formatSeoulDateTimeInputValue = (value: string | null | undefined) => {
  if (!value) {
    return ""
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  })

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  )

  const year = parts.year
  const month = parts.month
  const day = parts.day
  const hour = parts.hour
  const minute = parts.minute

  if (!year || !month || !day || !hour || !minute) {
    return ""
  }

  return `${year}-${month}-${day}T${hour}:${minute}`
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
    timeZone: SEOUL_TIME_ZONE,
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options
  }).format(date)
}
