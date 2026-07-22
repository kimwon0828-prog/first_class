import type {
  ApplicationRegistrationStatus,
  StudioUnregisteredApplicationItem
} from "@/shared/lib/db/adapter"
import {
  buildStudioDateRangeFromPreset,
  getStudioDateRangeEndIso,
  getStudioDateRangeStartIso
} from "@/features/studio/lib/studio-date-range"

export type UnregisteredRegistrationFilterKey = "all" | "pending" | "undecided" | "not_enrolled"
export type UnregisteredPeriodKey = "all" | "7d" | "30d" | "thisMonth"

export const UNREGISTERED_REGISTRATION_FILTERS: Array<{
  key: UnregisteredRegistrationFilterKey
  label: string
}> = [
  { key: "all", label: "전체" },
  { key: "pending", label: "고민 중" },
  { key: "undecided", label: "결과 미기록" },
  { key: "not_enrolled", label: "미등록 확정" }
]

export const UNREGISTERED_PERIOD_OPTIONS: Array<{
  value: UnregisteredPeriodKey
  label: string
}> = [
  { value: "all", label: "전체" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "thisMonth", label: "이번 달" }
]

export type ResolvedUnregisteredPeriod = {
  key: UnregisteredPeriodKey
  label: string
  completedAtFrom: string | null
  completedAtTo: string | null
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

const formatDateAsYmd = (value: Date) => {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(
    value.getUTCDate()
  ).padStart(2, "0")}`
}

const toKstUtcDate = (baseDate: Date) => {
  const shifted = new Date(baseDate.getTime() + 9 * 60 * 60 * 1000)
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()))
}

export const resolveUnregisteredRegistrationFilter = (
  value: string | null | undefined
): UnregisteredRegistrationFilterKey => {
  return UNREGISTERED_REGISTRATION_FILTERS.some((filter) => filter.key === value)
    ? (value as UnregisteredRegistrationFilterKey)
    : "all"
}

export const resolveUnregisteredPeriod = (
  value: string | null | undefined,
  baseDate: Date = new Date()
): ResolvedUnregisteredPeriod => {
  if (value === "7d") {
    const range = buildStudioDateRangeFromPreset("last7Days", baseDate)
    return {
      key: "7d",
      label: "최근 7일",
      completedAtFrom: range?.startDate ? getStudioDateRangeStartIso(range.startDate) : null,
      completedAtTo: range?.endDate ? getStudioDateRangeEndIso(range.endDate) : null
    }
  }

  if (value === "30d") {
    const today = toKstUtcDate(baseDate)
    const start = new Date(today)
    start.setUTCDate(start.getUTCDate() - 29)
    const startDate = formatDateAsYmd(start)
    const endDate = formatDateAsYmd(today)

    return {
      key: "30d",
      label: "최근 30일",
      completedAtFrom: getStudioDateRangeStartIso(startDate),
      completedAtTo: getStudioDateRangeEndIso(endDate)
    }
  }

  if (value === "thisMonth") {
    const range = buildStudioDateRangeFromPreset("thisMonth", baseDate)
    return {
      key: "thisMonth",
      label: "이번 달",
      completedAtFrom: range?.startDate ? getStudioDateRangeStartIso(range.startDate) : null,
      completedAtTo: range?.endDate ? getStudioDateRangeEndIso(range.endDate) : null
    }
  }

  return {
    key: "all",
    label: "전체",
    completedAtFrom: null,
    completedAtTo: null
  }
}

export const resolveUnregisteredGroupKey = (
  registrationStatus: ApplicationRegistrationStatus | null | undefined
): Exclude<UnregisteredRegistrationFilterKey, "all"> => {
  if (registrationStatus === "pending") {
    return "pending"
  }

  if (registrationStatus === "not_enrolled") {
    return "not_enrolled"
  }

  return "undecided"
}

export const getDaysSinceCompleted = (completedAt: string, now: Date = new Date()) => {
  const completedDate = new Date(completedAt)
  if (Number.isNaN(completedDate.getTime())) {
    return 0
  }

  return Math.max(0, Math.floor((now.getTime() - completedDate.getTime()) / MS_PER_DAY))
}

export const matchesUnregisteredSearch = (
  item: StudioUnregisteredApplicationItem,
  query: string | null | undefined
) => {
  const normalizedQuery = query?.trim().toLowerCase() ?? ""
  if (!normalizedQuery) {
    return true
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)
  const haystack = [
    item.childName,
    item.childGrade,
    item.parentName ?? "",
    item.parentPhone ?? "",
    item.classTitle ?? "",
    item.classSubject ?? "",
    item.assignedTeacherName ?? ""
  ]
    .join(" ")
    .toLowerCase()

  return tokens.every((token) => haystack.includes(token))
}
