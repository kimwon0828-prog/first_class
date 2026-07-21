const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const STUDIO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type StudioDateRangePreset =
  | "all"
  | "today"
  | "last7Days"
  | "thisMonth"
  | "lastMonth"
  | "custom"

export type StudioDateRangeQueryInput = {
  startDate?: string | null
  endDate?: string | null
}

export type StudioResolvedDateRange = {
  preset: StudioDateRangePreset
  startDate: string | null
  endDate: string | null
  createdAtFrom: string | null
  createdAtTo: string | null
  label: string
}

type KstDateParts = {
  year: number
  month: number
  day: number
}

type KstDateRange = {
  startDate: string
  endDate: string
}

export const STUDIO_DATE_RANGE_PRESET_OPTIONS: Array<{
  value: StudioDateRangePreset
  label: string
}> = [
  { value: "all", label: "전체" },
  { value: "today", label: "오늘" },
  { value: "last7Days", label: "최근 7일" },
  { value: "thisMonth", label: "이번 달" },
  { value: "lastMonth", label: "지난달" },
  { value: "custom", label: "직접 설정" }
]

const toShiftedKstDate = (baseDate: Date) => new Date(baseDate.getTime() + KST_OFFSET_MS)

const getKstTodayParts = (baseDate: Date): KstDateParts => {
  const shifted = toShiftedKstDate(baseDate)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  }
}

const toUtcDateFromKstParts = ({ year, month, day }: KstDateParts) =>
  new Date(Date.UTC(year, month - 1, day))

const formatUtcDateAsYmd = (value: Date) => {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate()
  ).padStart(2, "0")}`
}

const addDays = (value: Date, days: number) => {
  const next = new Date(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

const parseKstDate = (value: string | null | undefined): KstDateParts | null => {
  const normalized = value?.trim() ?? ""
  if (!STUDIO_DATE_RE.test(normalized)) {
    return null
  }

  const [yearText, monthText, dayText] = normalized.split("-")
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day))
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() + 1 !== month ||
    utcDate.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

const toRangeLabel = (preset: StudioDateRangePreset, startDate: string | null, endDate: string | null) => {
  if (preset === "all" || !startDate || !endDate) {
    return "전체"
  }

  const option = STUDIO_DATE_RANGE_PRESET_OPTIONS.find((item) => item.value === preset)
  if (option && preset !== "custom") {
    return option.label
  }

  return `${startDate} ~ ${endDate}`
}

export const buildStudioDateRangeFromPreset = (
  preset: Exclude<StudioDateRangePreset, "custom">,
  baseDate: Date = new Date()
): KstDateRange | null => {
  if (preset === "all") {
    return null
  }

  const today = toUtcDateFromKstParts(getKstTodayParts(baseDate))

  if (preset === "today") {
    const todayText = formatUtcDateAsYmd(today)
    return { startDate: todayText, endDate: todayText }
  }

  if (preset === "last7Days") {
    return {
      startDate: formatUtcDateAsYmd(addDays(today, -6)),
      endDate: formatUtcDateAsYmd(today)
    }
  }

  if (preset === "thisMonth") {
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
    return {
      startDate: formatUtcDateAsYmd(monthStart),
      endDate: formatUtcDateAsYmd(today)
    }
  }

  const currentMonthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const lastMonthEnd = addDays(currentMonthStart, -1)
  const lastMonthStart = new Date(
    Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth(), 1)
  )

  return {
    startDate: formatUtcDateAsYmd(lastMonthStart),
    endDate: formatUtcDateAsYmd(lastMonthEnd)
  }
}

export const getStudioDateRangeStartIso = (dateText: string) => {
  const parsed = parseKstDate(dateText)
  if (!parsed) {
    return null
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day) - KST_OFFSET_MS).toISOString()
}

export const getStudioDateRangeEndIso = (dateText: string) => {
  const parsed = parseKstDate(dateText)
  if (!parsed) {
    return null
  }

  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1) - KST_OFFSET_MS - 1).toISOString()
}

export const resolveStudioDateRange = (
  input: StudioDateRangeQueryInput,
  options?: {
    defaultPreset?: Exclude<StudioDateRangePreset, "custom">
    fallbackPreset?: Exclude<StudioDateRangePreset, "custom">
  }
): StudioResolvedDateRange => {
  const defaultPreset = options?.defaultPreset ?? "thisMonth"
  const fallbackPreset = options?.fallbackPreset ?? defaultPreset
  const startDate = input.startDate?.trim() ?? ""
  const endDate = input.endDate?.trim() ?? ""

  if (!startDate && !endDate) {
    const presetRange = buildStudioDateRangeFromPreset(defaultPreset)
    return {
      preset: defaultPreset,
      startDate: presetRange?.startDate ?? null,
      endDate: presetRange?.endDate ?? null,
      createdAtFrom: presetRange?.startDate ? getStudioDateRangeStartIso(presetRange.startDate) : null,
      createdAtTo: presetRange?.endDate ? getStudioDateRangeEndIso(presetRange.endDate) : null,
      label: toRangeLabel(defaultPreset, presetRange?.startDate ?? null, presetRange?.endDate ?? null)
    }
  }

  if (!startDate || !endDate) {
    return resolveStudioDateRange({}, { defaultPreset: fallbackPreset, fallbackPreset })
  }

  const parsedStart = parseKstDate(startDate)
  const parsedEnd = parseKstDate(endDate)
  if (!parsedStart || !parsedEnd) {
    return resolveStudioDateRange({}, { defaultPreset: fallbackPreset, fallbackPreset })
  }

  const startUtcDate = toUtcDateFromKstParts(parsedStart)
  const endUtcDate = toUtcDateFromKstParts(parsedEnd)
  if (startUtcDate.getTime() > endUtcDate.getTime()) {
    return resolveStudioDateRange({}, { defaultPreset: fallbackPreset, fallbackPreset })
  }

  const normalizedStartDate = formatUtcDateAsYmd(startUtcDate)
  const normalizedEndDate = formatUtcDateAsYmd(endUtcDate)
  const matchedPreset =
    (["today", "last7Days", "thisMonth", "lastMonth"] as const).find((preset) => {
      const presetRange = buildStudioDateRangeFromPreset(preset)
      return (
        presetRange?.startDate === normalizedStartDate && presetRange?.endDate === normalizedEndDate
      )
    }) ?? "custom"

  return {
    preset: matchedPreset,
    startDate: normalizedStartDate,
    endDate: normalizedEndDate,
    createdAtFrom: getStudioDateRangeStartIso(normalizedStartDate),
    createdAtTo: getStudioDateRangeEndIso(normalizedEndDate),
    label: toRangeLabel(matchedPreset, normalizedStartDate, normalizedEndDate)
  }
}
