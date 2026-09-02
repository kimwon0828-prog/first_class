// /studio/schedule 월간 캘린더의 순수 계산.
//
// ⚠️ timezone.
//   Studio 운영 기준 시간대는 서울 하나다. 브라우저가 KST 든 UTC 든 미국이든
//   같은 일정은 같은 서울 날짜 칸에 있어야 한다.
//   그래서 이 파일은 timestamptz → 서울 날짜/시각 변환에 getSeoulDateTimeParts 만 쓰고,
//   달력 격자(날짜만 다루는 계산)는 Date 객체 없이 정수 산술로만 만든다.
//   new Date(`${ymd}T00:00:00`) 같은 실행 환경 의존 파싱은 쓰지 않는다.

import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

export type CalendarDateKey = string

export type MonthGridCell = {
  /** "YYYY-MM-DD" (서울 기준) */
  key: CalendarDateKey
  day: number
  isCurrentMonth: boolean
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const DAYS_IN_WEEK = 7

const pad2 = (value: number) => String(value).padStart(2, "0")

export const buildDateKey = (year: number, month: number, day: number): CalendarDateKey =>
  `${year}-${pad2(month)}-${pad2(day)}`

type CivilDate = { year: number; month: number; day: number }

export const parseDateKey = (value: string): CivilDate | null => {
  const matched = DATE_KEY_PATTERN.exec(value.trim())
  if (!matched) {
    return null
  }

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  return { year, month, day }
}

/** 1970-01-01 기준 일수. Howard Hinnant 의 days_from_civil. 실행 환경 timezone 과 무관하다. */
export const toDayNumber = ({ year, month, day }: CivilDate) => {
  const shiftedYear = year - (month <= 2 ? 1 : 0)
  const era = Math.floor(shiftedYear / 400)
  const yearOfEra = shiftedYear - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

/** toDayNumber 의 역함수(civil_from_days). */
export const fromDayNumber = (dayNumber: number): CivilDate => {
  const shifted = dayNumber + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365
  )
  const year = yearOfEra + era * 400
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153)
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1
  const month = monthPrime + (monthPrime < 10 ? 3 : -9)

  return { year: year + (month <= 2 ? 1 : 0), month, day }
}

/** 0=일요일. 1970-01-01 은 목요일이라 +4 한다. */
export const toWeekday = (dayNumber: number) => ((dayNumber % 7) + 11) % 7

/** timestamptz → 서울 기준 "YYYY-MM-DD". */
export const toSeoulDateKey = (value: string): CalendarDateKey | null => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? buildDateKey(parts.year, parts.month, parts.day) : null
}

/** timestamptz → 서울 기준 "HH:mm". */
export const toSeoulTimeLabel = (value: string): string | null => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${pad2(parts.hour)}:${pad2(parts.minute)}` : null
}

/** 지금 이 순간의 "서울 오늘". 브라우저 로컬 오늘이 아니다. */
export const getSeoulTodayKey = (now: Date = new Date()): CalendarDateKey => {
  const parts = getSeoulDateTimeParts(now)
  if (!parts) {
    // Intl 이 실패할 환경은 사실상 없지만, 달력이 통째로 비지 않도록 UTC+9 로 보정한다.
    const fallback = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    return buildDateKey(fallback.getUTCFullYear(), fallback.getUTCMonth() + 1, fallback.getUTCDate())
  }

  return buildDateKey(parts.year, parts.month, parts.day)
}

/** "YYYY-MM-DD" → 그 달의 1일 key. */
export const toMonthStartKey = (dateKey: CalendarDateKey): CalendarDateKey => {
  const civil = parseDateKey(dateKey)
  if (!civil) {
    return dateKey
  }

  return buildDateKey(civil.year, civil.month, 1)
}

export const shiftMonthKey = (monthStartKey: CalendarDateKey, offset: number): CalendarDateKey => {
  const civil = parseDateKey(monthStartKey)
  if (!civil) {
    return monthStartKey
  }

  const zeroBased = civil.year * 12 + (civil.month - 1) + offset
  return buildDateKey(Math.floor(zeroBased / 12), (((zeroBased % 12) + 12) % 12) + 1, 1)
}

export const formatMonthLabel = (monthStartKey: CalendarDateKey) => {
  const civil = parseDateKey(monthStartKey)
  return civil ? `${civil.year}년 ${civil.month}월` : monthStartKey
}

/**
 * 앞뒤 달 날짜까지 포함한 7열 격자.
 * 일요일에서 시작해 토요일에서 끝나므로 항상 7의 배수개가 나온다.
 */
export const buildMonthGrid = (monthStartKey: CalendarDateKey): MonthGridCell[] => {
  const civil = parseDateKey(monthStartKey)
  if (!civil) {
    return []
  }

  const firstDayNumber = toDayNumber({ year: civil.year, month: civil.month, day: 1 })
  const nextMonth = shiftMonthKey(monthStartKey, 1)
  const nextCivil = parseDateKey(nextMonth)
  const lastDayNumber = nextCivil ? toDayNumber(nextCivil) - 1 : firstDayNumber

  const gridStart = firstDayNumber - toWeekday(firstDayNumber)
  const gridEnd = lastDayNumber + (6 - toWeekday(lastDayNumber))

  const cells: MonthGridCell[] = []
  for (let dayNumber = gridStart; dayNumber <= gridEnd; dayNumber += 1) {
    const date = fromDayNumber(dayNumber)
    cells.push({
      key: buildDateKey(date.year, date.month, date.day),
      day: date.day,
      isCurrentMonth: date.month === civil.month && date.year === civil.year
    })
  }

  return cells
}

export const SEOUL_WEEKDAY_SHORT_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const

/** "9월 2일 수요일" 같은 선택 날짜 라벨. Date 객체 없이 만든다. */
export const formatSelectedDateLabel = (dateKey: CalendarDateKey) => {
  const civil = parseDateKey(dateKey)
  if (!civil) {
    return dateKey
  }

  const weekday = SEOUL_WEEKDAY_SHORT_LABELS[toWeekday(toDayNumber(civil))]
  return `${civil.month}월 ${civil.day}일 ${weekday}요일`
}

export const isSameMonth = (dateKey: CalendarDateKey, monthStartKey: CalendarDateKey) => {
  const left = parseDateKey(dateKey)
  const right = parseDateKey(monthStartKey)
  return Boolean(left && right && left.year === right.year && left.month === right.month)
}

export const DAYS_IN_CALENDAR_WEEK = DAYS_IN_WEEK
