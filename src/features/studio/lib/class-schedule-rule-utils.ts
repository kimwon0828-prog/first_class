export const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const
export const weekdayLongLabels = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일"
] as const

export const isValidDateInput = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())

export const isValidTimeValue = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

export const timeToMinutes = (value: string) => {
  if (!isValidTimeValue(value)) {
    return null
  }

  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

export const minutesToTime = (value: number) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`

export const addMinutesToTime = (startTime: string, durationMinutes: number) => {
  const startMinutes = timeToMinutes(startTime)
  if (startMinutes == null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null
  }

  const endMinutes = startMinutes + durationMinutes
  if (endMinutes > 24 * 60) {
    return null
  }

  return minutesToTime(endMinutes)
}

export type SplitTimeSlot = {
  startTime: string
  endTime: string
}

export const splitTimeRangeIntoSlots = (
  startTime: string,
  endTime: string,
  durationMinutes: number
): SplitTimeSlot[] => {
  const startMinutes = timeToMinutes(startTime)
  const endMinutesValue = timeToMinutes(endTime)
  if (
    startMinutes == null ||
    endMinutesValue == null ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes <= 0 ||
    endMinutesValue <= startMinutes
  ) {
    return []
  }

  const slots: SplitTimeSlot[] = []
  for (let cursor = startMinutes; cursor + durationMinutes <= endMinutesValue; cursor += durationMinutes) {
    slots.push({
      startTime: minutesToTime(cursor),
      endTime: minutesToTime(cursor + durationMinutes)
    })
  }

  return slots
}

export const formatKoreanMeridiemTime = (value: string) => {
  const totalMinutes = timeToMinutes(value)
  if (totalMinutes == null) {
    return value
  }

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const meridiem = hours < 12 ? "오전" : "오후"
  const displayHour = hours % 12 === 0 ? 12 : hours % 12
  return `${meridiem} ${displayHour}:${String(minutes).padStart(2, "0")}`
}

export const formatWeekdaySet = (weekdays: number[]) =>
  [...weekdays]
    .sort((left, right) => left - right)
    .map((weekday) => weekdayLabels[weekday] ?? "")
    .filter(Boolean)

export const formatDateHeadline = (value: string) => {
  if (!isValidDateInput(value)) {
    return value
  }

  const date = new Date(`${value}T00:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdayLabels[date.getDay()]})`
}

export const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

export const parseMonth = (value: string) => {
  const parsed = new Date(`${value}-01T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

export const toMonthValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
