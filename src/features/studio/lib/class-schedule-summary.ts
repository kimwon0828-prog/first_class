// Studio Classes List 의 "예약 일정" 요약.
//
// class_schedules 는 반복 수업도 occurrence 단위 one_time row 로 펼쳐서 저장한다.
// 그래서 row 개수(448개, 516개)는 DB 관점에서는 맞아도 목록에서는 운영 정보가 아니다.
// 여기서는 저장 방식을 바꾸지 않고, 목록 표시용 요약만 만든다.
//
// ⚠️ 거짓 반복 일정 금지.
//   one_time occurrence 가 여러 개라는 이유만으로 "매주" 라고 쓰지 않는다.
//   native weekly row 가 있거나, strict recurrence 검사를 통과한 경우에만 "매주" 를 쓴다.
//
// ⚠️ KST 안전.
//   specific_date 는 date-only, start_time 은 time-only 컬럼이다.
//   new Date("2026-09-16") 같은 runtime timezone 해석을 쓰면 요일이 하루 밀릴 수 있어
//   이 파일은 Date 객체를 전혀 만들지 않고 정수 산술로만 요일/간격을 계산한다.

import { weekdayLabels } from "@/features/studio/lib/class-schedule-rule-utils"
import type { StudioClassScheduleSummary } from "@/shared/lib/db/adapter"

export type StudioClassScheduleSummaryInput = {
  scheduleType: string | null
  dayOfWeek: number | null
  specificDate: string | null
  startTime: string | null
}

export const EMPTY_STUDIO_CLASS_SCHEDULE_SUMMARY: StudioClassScheduleSummary = {
  kind: "none",
  primary: "미설정",
  secondary: null
}

/** 요일 나열 순서. 월요일부터 읽는 한국식 순서를 쓴다(0=일). */
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** "16:00:00" / "16:00" → "16:00". 형식이 아니면 null. */
const normalizeTime = (value: string | null): string | null => {
  if (!value) {
    return null
  }

  const matched = /^([01]\d|2[0-3]):([0-5]\d)/.exec(value.trim())
  return matched ? `${matched[1]}:${matched[2]}` : null
}

type CivilDate = { year: number; month: number; day: number }

const parseCivilDate = (value: string | null): CivilDate | null => {
  if (!value) {
    return null
  }

  const matched = DATE_PATTERN.exec(value.trim())
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

/**
 * 1970-01-01 기준 일수. Howard Hinnant 의 days_from_civil.
 * Date 객체를 쓰지 않으므로 실행 환경 timezone 과 무관하다.
 */
const toDayNumber = ({ year, month, day }: CivilDate) => {
  const shiftedYear = year - (month <= 2 ? 1 : 0)
  const era = Math.floor(shiftedYear / 400)
  const yearOfEra = shiftedYear - era * 400
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear
  return era * 146097 + dayOfEra - 719468
}

/** 0=일요일. 1970-01-01 은 목요일이라 +4 한다. */
const toWeekday = (dayNumber: number) => ((dayNumber % 7) + 11) % 7

type DatedOccurrence = {
  dayNumber: number
  weekday: number
  time: string
  civil: CivilDate
}

const formatMonthDay = ({ month, day }: CivilDate) => `${month}/${day}`

const formatDateRange = (first: CivilDate, last: CivilDate) => {
  // 같은 해면 M/D 로 짧게. 해가 넘어갈 때만 연도를 붙인다.
  if (first.year === last.year) {
    return `${formatMonthDay(first)} ~ ${formatMonthDay(last)}`
  }

  const yearPrefix = (value: CivilDate) => `${String(value.year).slice(2)}.`
  return `${yearPrefix(first)}${formatMonthDay(first)} ~ ${yearPrefix(last)}${formatMonthDay(last)}`
}

const sortWeekdays = (weekdays: number[]) =>
  [...weekdays].sort(
    (left, right) => WEEKDAY_DISPLAY_ORDER.indexOf(left) - WEEKDAY_DISPLAY_ORDER.indexOf(right)
  )

/** 시각 집합. 3개까지는 그대로 적고, 더 많으면 개수만 적는다. */
const formatTimeSet = (times: Iterable<string>) => {
  const sorted = Array.from(new Set(times)).sort()
  return sorted.length <= 3 ? sorted.join(" · ") : `${sorted.length}개 시간대`
}

/** 요일 집합. 3개까지는 그대로 적고, 더 많으면 개수만 적는다. */
const formatWeekdaySet = (weekdays: Iterable<number>) => {
  const unique = sortWeekdays(Array.from(new Set(weekdays)))
  if (unique.length > 3) {
    return `${unique.length}개 요일`
  }

  return unique
    .map((weekday) => weekdayLabels[weekday] ?? "")
    .filter(Boolean)
    .join(" · ")
}

/** 요일이 나열됐으면 공백, 개수로 줄었으면 가운뎃점으로 잇는다. */
const joinWeekdayAndTime = (weekdayCount: number, weekdayText: string, timeText: string) =>
  weekdayCount > 3 ? `${weekdayText} · ${timeText}` : `${weekdayText} ${timeText}`

/**
 * 요일 → 시각 집합을 한 줄로 만든다.
 * 요일별 시간표가 모두 같으면 한 번만 적고, 다르면 요일마다 적는다.
 * 어느 쪽이든 List row 한 줄을 넘지 않도록 개수 표기로 줄인다.
 */
const formatWeeklyRules = (timesByWeekday: Map<number, Set<string>>) => {
  const weekdays = sortWeekdays(Array.from(timesByWeekday.keys()))
  const allTimes = new Set<string>()
  for (const times of timesByWeekday.values()) {
    for (const time of times) {
      allTimes.add(time)
    }
  }

  const signatures = weekdays.map((weekday) =>
    Array.from(timesByWeekday.get(weekday) ?? []).sort().join(",")
  )
  const isUniform = signatures.every((signature) => signature === signatures[0])

  if (isUniform) {
    return `매주 ${joinWeekdayAndTime(
      weekdays.length,
      formatWeekdaySet(weekdays),
      formatTimeSet(timesByWeekday.get(weekdays[0]) ?? [])
    )}`
  }

  // 요일마다 시간이 다르다. 2개 요일까지만 나열하고 그 이상은 개수로 줄인다.
  if (weekdays.length <= 2) {
    const entries = weekdays.map(
      (weekday) => `${weekdayLabels[weekday]} ${formatTimeSet(timesByWeekday.get(weekday) ?? [])}`
    )
    return `매주 ${entries.join(" · ")}`
  }

  return `매주 ${formatWeekdaySet(weekdays)} · ${formatTimeSet(allTimes)}`
}

/** weekly candidate 최소 반복 횟수. */
const STRICT_WEEKLY_MIN_OCCURRENCES = 3
const DAYS_IN_WEEK = 7

/**
 * (요일, 시각) 그룹이 정확히 7일 간격으로 3회 이상 반복될 때만 weekly 로 인정한다.
 * 한 주가 빠진 실제 반복수업도 있을 수 있으나, 거짓 "매주" 보다 보수적인 fallback 이 낫다.
 */
const isStrictWeeklyGroup = (dayNumbers: number[]) => {
  const unique = Array.from(new Set(dayNumbers)).sort((left, right) => left - right)
  if (unique.length < STRICT_WEEKLY_MIN_OCCURRENCES) {
    return false
  }

  for (let index = 1; index < unique.length; index += 1) {
    if (unique[index] - unique[index - 1] !== DAYS_IN_WEEK) {
      return false
    }
  }

  return true
}

const summarizeIrregular = (occurrences: DatedOccurrence[]): StudioClassScheduleSummary => {
  const sorted = [...occurrences].sort(
    (left, right) => left.dayNumber - right.dayNumber || left.time.localeCompare(right.time)
  )
  const first = sorted[0]

  if (sorted.length === 1) {
    return {
      kind: "single",
      primary: `${formatMonthDay(first.civil)} ${first.time}`,
      secondary: null
    }
  }

  // 몇 개 안 되면 실제 첫 일정을 그대로 보여주는 편이 정확하다.
  if (sorted.length <= 4) {
    return {
      kind: "multiple",
      primary: `${formatMonthDay(first.civil)} ${first.time}`,
      secondary: `외 ${sorted.length - 1}개 일정`
    }
  }

  const last = sorted[sorted.length - 1]
  const weekdays = Array.from(new Set(sorted.map((occurrence) => occurrence.weekday)))
  const times = Array.from(new Set(sorted.map((occurrence) => occurrence.time)))
  return {
    kind: "multiple",
    primary: formatDateRange(first.civil, last.civil),
    secondary: `${formatWeekdaySet(weekdays)} · ${formatTimeSet(times)}`
  }
}

export const summarizeStudioClassSchedules = (
  rows: StudioClassScheduleSummaryInput[]
): StudioClassScheduleSummary => {
  const weeklyTimesByWeekday = new Map<number, Set<string>>()
  const occurrences: DatedOccurrence[] = []

  for (const row of rows) {
    const time = normalizeTime(row.startTime)
    if (!time) {
      continue
    }

    // native weekly rule 은 요일/시각을 그대로 쓴다. 추론이 필요 없다.
    if (row.scheduleType === "weekly" && row.dayOfWeek != null && row.dayOfWeek >= 0 && row.dayOfWeek <= 6) {
      const times = weeklyTimesByWeekday.get(row.dayOfWeek) ?? new Set<string>()
      times.add(time)
      weeklyTimesByWeekday.set(row.dayOfWeek, times)
      continue
    }

    const civil = parseCivilDate(row.specificDate)
    if (!civil) {
      continue
    }

    const dayNumber = toDayNumber(civil)
    occurrences.push({ dayNumber, weekday: toWeekday(dayNumber), time, civil })
  }

  if (weeklyTimesByWeekday.size === 0 && occurrences.length === 0) {
    return EMPTY_STUDIO_CLASS_SCHEDULE_SUMMARY
  }

  // 1. native weekly rule 이 있으면 그것이 곧 답이다.
  if (weeklyTimesByWeekday.size > 0) {
    return {
      kind: "weekly",
      primary: formatWeeklyRules(weeklyTimesByWeekday),
      secondary: occurrences.length > 0 ? `그 외 개별 일정 ${occurrences.length}개` : null
    }
  }

  // 2. one_time occurrence 만 있을 때. strict recurrence 검사를 통과해야 "매주" 다.
  const groups = new Map<string, DatedOccurrence[]>()
  for (const occurrence of occurrences) {
    const key = `${occurrence.weekday}|${occurrence.time}`
    const group = groups.get(key) ?? []
    group.push(occurrence)
    groups.set(key, group)
  }

  const isFullyWeekly = Array.from(groups.values()).every((group) =>
    isStrictWeeklyGroup(group.map((occurrence) => occurrence.dayNumber))
  )

  if (isFullyWeekly) {
    const timesByWeekday = new Map<number, Set<string>>()
    for (const occurrence of occurrences) {
      const times = timesByWeekday.get(occurrence.weekday) ?? new Set<string>()
      times.add(occurrence.time)
      timesByWeekday.set(occurrence.weekday, times)
    }

    const sorted = [...occurrences].sort((left, right) => left.dayNumber - right.dayNumber)

    return {
      kind: "weekly",
      primary: formatWeeklyRules(timesByWeekday),
      secondary: formatDateRange(sorted[0].civil, sorted[sorted.length - 1].civil)
    }
  }

  return summarizeIrregular(occurrences)
}
