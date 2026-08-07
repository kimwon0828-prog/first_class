"use client"

import {
  addMinutesToTime,
  formatKoreanMeridiemTime,
  formatWeekdaySet,
  isValidDateInput,
  isValidTimeValue,
  timeToMinutes,
  toDateKey,
  weekdayLabels
} from "@/features/studio/lib/class-schedule-rule-utils"
import type { StudioClassScheduleBookingStatus } from "@/shared/lib/db/adapter"

export const OPEN_ENDED_GENERATION_DAYS = 90

export type OperatingHoursMode = "same" | "weekdayWeekend" | "custom"

export type OperatingHoursTimeRangeDraft = {
  id: string
  startTime: string
  lastStartTime: string
  capacity: string
}

export type OperatingHoursGroupDraft = {
  id: string
  weekdays: number[]
  timeRanges: OperatingHoursTimeRangeDraft[]
}

export type CreateClassScheduleDraft = {
  operationStartDate: string
  operationEndDate: string
  isAlwaysOpen: boolean
  intervalMinutes: string
  defaultCapacity: string
  usePerTimeRangeCapacity: boolean
  operatingMode: OperatingHoursMode
  groups: OperatingHoursGroupDraft[]
  extraSlots: Array<{
    id: string
    specificDate: string
    startTime: string
    endTime: string
    capacity: string
    bookingStatus: "open" | "closed"
  }>
  closedDates: string[]
  closedSlotKeys: string[]
}

export type CreateClassScheduleDraftSlot = {
  id: string
  seriesId: string | null
  specificDate: string
  startTime: string
  endTime: string
  capacity: number
  bookingStatus: "open" | "closed"
  source: "rule" | "extra"
}

export type EditableStudioScheduleSlotDraft = {
  localId: string
  persistedId: string
  scheduleType: "weekly" | "one_time"
  bookingStatus: StudioClassScheduleBookingStatus
  dayOfWeek: string
  specificDate: string
  seriesId: string
  startTime: string
  endTime: string
  capacity: string
  displayLabel: string
  applicationCount: number
  isReferencedByApplications: boolean
}

export type OperatingHoursSummaryGroup = {
  id: string
  weekdayLabel: string
  timeLabels: string[]
  capacityLabel: string
}

export type OperatingHoursSummary = {
  hasValue: boolean
  periodLabel: string
  groups: OperatingHoursSummaryGroup[]
}

const createLocalId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export const buildSlotKey = (specificDate: string, startTime: string) => `${specificDate}::${startTime}`

export const createOperatingHoursTimeRangeDraft = (capacity = ""): OperatingHoursTimeRangeDraft => ({
  id: createLocalId(),
  startTime: "",
  lastStartTime: "",
  capacity
})

export const createOperatingHoursGroupDraft = (
  weekdays: number[] = [],
  capacity = "",
  id = crypto.randomUUID()
): OperatingHoursGroupDraft => ({
  id,
  weekdays,
  timeRanges: [createOperatingHoursTimeRangeDraft(capacity)]
})

export const createDefaultCreateClassScheduleDraft = (): CreateClassScheduleDraft => ({
  operationStartDate: "",
  operationEndDate: "",
  isAlwaysOpen: false,
  intervalMinutes: "60",
  defaultCapacity: "",
  usePerTimeRangeCapacity: false,
  operatingMode: "same",
  groups: [],
  extraSlots: [],
  closedDates: [],
  closedSlotKeys: []
})

export const createDraftTemplateForMode = (
  mode: OperatingHoursMode,
  current: CreateClassScheduleDraft
): CreateClassScheduleDraft => {
  const capacity = current.defaultCapacity

  if (mode === "same") {
    return {
      ...current,
      operatingMode: mode,
      groups: [
        createOperatingHoursGroupDraft(current.groups[0]?.weekdays ?? [1, 2, 3, 4, 5], capacity, current.groups[0]?.id)
      ]
    }
  }

  if (mode === "weekdayWeekend") {
    return {
      ...current,
      operatingMode: mode,
      groups: [
        createOperatingHoursGroupDraft([1, 2, 3, 4, 5], capacity, current.groups[0]?.id ?? crypto.randomUUID()),
        createOperatingHoursGroupDraft([0, 6], capacity, current.groups[1]?.id ?? crypto.randomUUID())
      ]
    }
  }

  return {
    ...current,
    operatingMode: mode,
    groups:
      current.groups.length > 0
        ? current.groups
        : [createOperatingHoursGroupDraft([1, 3, 5], capacity), createOperatingHoursGroupDraft([6], capacity)]
  }
}

const formatDateText = (value: string) => {
  if (!isValidDateInput(value)) {
    return ""
  }

  const date = new Date(`${value}T00:00:00`)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`
}

const resolveOperationEndDate = (draft: CreateClassScheduleDraft) => {
  if (!isValidDateInput(draft.operationStartDate)) {
    return null
  }

  if (draft.isAlwaysOpen || !draft.operationEndDate) {
    const startDate = new Date(`${draft.operationStartDate}T00:00:00`)
    startDate.setDate(startDate.getDate() + OPEN_ENDED_GENERATION_DAYS - 1)
    return toDateKey(startDate)
  }

  if (!isValidDateInput(draft.operationEndDate)) {
    return null
  }

  return draft.operationEndDate
}

export const buildSlotsFromStartAndLast = (
  startTime: string,
  lastStartTime: string,
  intervalMinutes: number
) => {
  const startMinutes = timeToMinutes(startTime)
  const lastStartMinutes = timeToMinutes(lastStartTime)

  if (
    startMinutes == null ||
    lastStartMinutes == null ||
    !Number.isFinite(intervalMinutes) ||
    intervalMinutes <= 0 ||
    lastStartMinutes < startMinutes
  ) {
    return []
  }

  if ((lastStartMinutes - startMinutes) % intervalMinutes !== 0) {
    return []
  }

  const slots: Array<{ startTime: string; endTime: string }> = []
  for (let cursor = startMinutes; cursor <= lastStartMinutes; cursor += intervalMinutes) {
    const nextStart = `${String(Math.floor(cursor / 60)).padStart(2, "0")}:${String(cursor % 60).padStart(2, "0")}`
    const endTime = addMinutesToTime(nextStart, intervalMinutes)
    if (!endTime) {
      return []
    }

    slots.push({
      startTime: nextStart,
      endTime
    })
  }

  return slots
}

export const buildCreateClassScheduleDraftSlots = (
  scheduleDraft: CreateClassScheduleDraft
): CreateClassScheduleDraftSlot[] => {
  const slotMap = new Map<string, CreateClassScheduleDraftSlot>()
  const operationStartDate = scheduleDraft.operationStartDate
  const operationEndDate = resolveOperationEndDate(scheduleDraft)
  const intervalMinutes = Number(scheduleDraft.intervalMinutes)

  if (
    isValidDateInput(operationStartDate) &&
    isValidDateInput(operationEndDate ?? "") &&
    operationEndDate &&
    operationEndDate >= operationStartDate
  ) {
    for (const group of scheduleDraft.groups) {
      const current = new Date(`${operationStartDate}T00:00:00`)
      const endDate = new Date(`${operationEndDate}T00:00:00`)

      while (current <= endDate) {
        const specificDate = toDateKey(current)
        if (group.weekdays.includes(current.getDay())) {
          const isDateClosed = scheduleDraft.closedDates.includes(specificDate)

          for (const range of group.timeRanges) {
            const capacitySource = scheduleDraft.usePerTimeRangeCapacity ? range.capacity : scheduleDraft.defaultCapacity
            const capacity = Number(capacitySource)
            const slots = buildSlotsFromStartAndLast(range.startTime, range.lastStartTime, intervalMinutes)

            if (slots.length === 0 || !Number.isFinite(capacity) || capacity < 1) {
              continue
            }

            for (const slot of slots) {
              const key = buildSlotKey(specificDate, slot.startTime)
              if (slotMap.has(key)) {
                continue
              }

              slotMap.set(key, {
                id: `${group.id}-${range.id}-${key}`,
                seriesId: group.id,
                specificDate,
                startTime: slot.startTime,
                endTime: slot.endTime,
                capacity,
                bookingStatus: isDateClosed || scheduleDraft.closedSlotKeys.includes(key) ? "closed" : "open",
                source: "rule"
              })
            }
          }
        }

        current.setDate(current.getDate() + 1)
      }
    }
  }

  for (const extraSlot of scheduleDraft.extraSlots) {
    const key = buildSlotKey(extraSlot.specificDate, extraSlot.startTime)
    if (slotMap.has(key)) {
      continue
    }

    const capacity = Number(extraSlot.capacity)
    if (
      !isValidDateInput(extraSlot.specificDate) ||
      !isValidTimeValue(extraSlot.startTime) ||
      !isValidTimeValue(extraSlot.endTime) ||
      extraSlot.endTime <= extraSlot.startTime ||
      !Number.isFinite(capacity) ||
      capacity < 1
    ) {
      continue
    }

    slotMap.set(key, {
      id: extraSlot.id,
      seriesId: null,
      specificDate: extraSlot.specificDate,
      startTime: extraSlot.startTime,
      endTime: extraSlot.endTime,
      capacity,
      bookingStatus:
        scheduleDraft.closedDates.includes(extraSlot.specificDate) || extraSlot.bookingStatus === "closed"
          ? "closed"
          : "open",
      source: "extra"
    })
  }

  return Array.from(slotMap.values()).sort((left, right) => {
    const dateCompare = left.specificDate.localeCompare(right.specificDate)
    if (dateCompare !== 0) {
      return dateCompare
    }

    return left.startTime.localeCompare(right.startTime)
  })
}

const summarizeGroup = (group: OperatingHoursGroupDraft, intervalMinutes: string): OperatingHoursSummaryGroup => ({
  id: group.id,
  weekdayLabel: formatWeekdaySet(group.weekdays).join("·") || "요일 미선택",
  timeLabels: group.timeRanges
    .filter((range) => range.startTime && range.lastStartTime)
    .map(
      (range) =>
        `${formatKoreanMeridiemTime(range.startTime)} ~ ${formatKoreanMeridiemTime(
          addMinutesToTime(range.lastStartTime, Number(intervalMinutes)) ?? range.lastStartTime
        )}`
    ),
  capacityLabel:
    group.timeRanges.length > 0
      ? group.timeRanges
          .map((range) =>
            range.capacity
              ? `${intervalMinutes}분 간격 · 타임당 정원 ${range.capacity}명`
              : `${intervalMinutes}분 간격 · 타임당 정원 미설정`
          )
          .join(" / ")
      : `${intervalMinutes}분 간격 · 타임당 정원 미설정`
})

export const summarizeCreateScheduleDraft = (draft: CreateClassScheduleDraft): OperatingHoursSummary => {
  const periodLabel =
    draft.operationStartDate && (draft.isAlwaysOpen || draft.operationEndDate)
      ? `${formatDateText(draft.operationStartDate)} ~ ${
          draft.isAlwaysOpen ? "종료일 없음" : formatDateText(draft.operationEndDate)
        }`
      : "운영 기간을 설정해 주세요."

  return {
    hasValue: draft.groups.some((group) => group.weekdays.length > 0 && group.timeRanges.some((range) => range.startTime)),
    periodLabel,
    groups: draft.groups.map((group) => ({
      ...summarizeGroup(group, draft.intervalMinutes),
      capacityLabel: draft.usePerTimeRangeCapacity
        ? summarizeGroup(group, draft.intervalMinutes).capacityLabel
        : draft.defaultCapacity
          ? `${draft.intervalMinutes}분 간격 · 타임당 정원 ${draft.defaultCapacity}명`
          : `${draft.intervalMinutes}분 간격 · 타임당 정원 미설정`
    }))
  }
}

const areSameWeekdays = (left: number[], right: number[]) =>
  [...left].sort((a, b) => a - b).join(",") === [...right].sort((a, b) => a - b).join(",")

const splitStartTimesIntoRanges = (startTimes: string[], intervalMinutes: number) => {
  const sorted = [...new Set(startTimes)].sort()
  if (sorted.length === 0) {
    return []
  }

  const ranges: Array<{ startTime: string; lastStartTime: string }> = []
  let currentStart = sorted[0]
  let previous = sorted[0]

  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]
    const previousMinutes = timeToMinutes(previous)
    const currentMinutes = timeToMinutes(current)
    if (
      previousMinutes == null ||
      currentMinutes == null ||
      currentMinutes - previousMinutes !== intervalMinutes
    ) {
      ranges.push({ startTime: currentStart, lastStartTime: previous })
      currentStart = current
    }
    previous = current
  }

  ranges.push({ startTime: currentStart, lastStartTime: previous })
  return ranges
}

const deriveMostCommonValue = (values: string[], fallback: string) => {
  if (values.length === 0) {
    return fallback
  }

  const counts = new Map<string, number>()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? fallback
}

export const deriveOperatingDraftFromScheduleSlots = (
  scheduleSlots: EditableStudioScheduleSlotDraft[],
  todayKey: string
): CreateClassScheduleDraft => {
  const eligibleSlots = scheduleSlots.filter(
    (slot) =>
      slot.scheduleType === "one_time" &&
      slot.seriesId &&
      slot.specificDate >= todayKey
  )

  if (eligibleSlots.length === 0) {
    return createDefaultCreateClassScheduleDraft()
  }

  const intervalMinutes = deriveMostCommonValue(
    eligibleSlots
      .map((slot) => {
        const startMinutes = timeToMinutes(slot.startTime)
        const endMinutes = timeToMinutes(slot.endTime)
        if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
          return null
        }
        return String(endMinutes - startMinutes)
      })
      .filter((value): value is string => Boolean(value)),
    "60"
  )

  const defaultCapacity = deriveMostCommonValue(
    eligibleSlots.map((slot) => slot.capacity).filter(Boolean),
    ""
  )
  const uniqueCapacities = [...new Set(eligibleSlots.map((slot) => slot.capacity).filter(Boolean))]
  const usePerTimeRangeCapacity = uniqueCapacities.length > 1

  const slotsBySeriesId = new Map<string, EditableStudioScheduleSlotDraft[]>()
  for (const slot of eligibleSlots) {
    const current = slotsBySeriesId.get(slot.seriesId) ?? []
    current.push(slot)
    slotsBySeriesId.set(slot.seriesId, current)
  }

  const groups: OperatingHoursGroupDraft[] = []
  for (const [seriesId, seriesSlots] of slotsBySeriesId.entries()) {
    const weekdaySet = new Set<number>()
    const startTimesByWeekday = new Map<number, string[]>()
    const capacityByWeekday = new Map<number, string>()

    for (const slot of seriesSlots) {
      const date = new Date(`${slot.specificDate}T00:00:00`)
      const weekday = date.getDay()
      weekdaySet.add(weekday)
      const startTimes = startTimesByWeekday.get(weekday) ?? []
      startTimes.push(slot.startTime)
      startTimesByWeekday.set(weekday, startTimes)
      if (!capacityByWeekday.has(weekday)) {
        capacityByWeekday.set(weekday, slot.capacity || "")
      }
    }

    const patternMap = new Map<
      string,
      { weekdays: number[]; timeRanges: OperatingHoursTimeRangeDraft[] }
    >()

    for (const weekday of [...weekdaySet].sort((a, b) => a - b)) {
      const ranges = splitStartTimesIntoRanges(startTimesByWeekday.get(weekday) ?? [], Number(intervalMinutes)).map(
        (range) => ({
          id: createLocalId(),
          startTime: range.startTime,
          lastStartTime: range.lastStartTime,
          capacity: capacityByWeekday.get(weekday) ?? ""
        })
      )

      const signature = JSON.stringify(
        ranges.map((range) => ({
          startTime: range.startTime,
          lastStartTime: range.lastStartTime,
          capacity: range.capacity
        }))
      )
      const current = patternMap.get(signature)
      if (current) {
        current.weekdays.push(weekday)
        continue
      }

      patternMap.set(signature, {
        weekdays: [weekday],
        timeRanges: ranges.length > 0 ? ranges : [createOperatingHoursTimeRangeDraft(defaultCapacity)]
      })
    }

    const seriesGroups = [...patternMap.values()]
    seriesGroups.forEach((group, index) => {
      groups.push({
        id: index === 0 ? seriesId : crypto.randomUUID(),
        weekdays: group.weekdays.sort((a, b) => a - b),
        timeRanges: group.timeRanges
      })
    })
  }

  const weekdayWeekendMode =
    groups.length === 2 &&
    groups.some((group) => areSameWeekdays(group.weekdays, [1, 2, 3, 4, 5])) &&
    groups.some((group) => areSameWeekdays(group.weekdays, [0, 6]))

  const operatingMode: OperatingHoursMode =
    groups.length === 1 ? "same" : weekdayWeekendMode ? "weekdayWeekend" : "custom"

  const operationStartDate = eligibleSlots.map((slot) => slot.specificDate).sort()[0] ?? ""
  const operationEndDate = eligibleSlots.map((slot) => slot.specificDate).sort().at(-1) ?? ""

  return {
    operationStartDate,
    operationEndDate,
    isAlwaysOpen: false,
    intervalMinutes,
    defaultCapacity: usePerTimeRangeCapacity ? "" : defaultCapacity,
    usePerTimeRangeCapacity,
    operatingMode,
    groups,
    extraSlots: [],
    closedDates: [],
    closedSlotKeys: []
  }
}

export const applyOperatingDraftToScheduleSlots = (
  existingSlots: EditableStudioScheduleSlotDraft[],
  draft: CreateClassScheduleDraft,
  todayKey: string
): EditableStudioScheduleSlotDraft[] => {
  const preservedSlots = existingSlots.filter((slot) => {
    if (slot.scheduleType === "weekly") {
      return true
    }

    if (slot.scheduleType !== "one_time") {
      return true
    }

    if (!slot.seriesId) {
      return true
    }

    if (slot.specificDate < todayKey) {
      return true
    }

    if (slot.isReferencedByApplications) {
      return true
    }

    return false
  })

  const editableSlots = existingSlots.filter(
    (slot) =>
      slot.scheduleType === "one_time" &&
      Boolean(slot.seriesId) &&
      slot.specificDate >= todayKey &&
      !slot.isReferencedByApplications
  )

  const editableSlotMap = new Map<string, EditableStudioScheduleSlotDraft>(
    editableSlots.map((slot) => [`${slot.seriesId}::${slot.specificDate}::${slot.startTime}`, slot] as const)
  )

  const nextGeneratedSlots = buildCreateClassScheduleDraftSlots(draft).map<EditableStudioScheduleSlotDraft>((slot) => {
    const key = `${slot.seriesId ?? ""}::${slot.specificDate}::${slot.startTime}`
    const matched = editableSlotMap.get(key)

    return {
      localId: matched?.localId ?? createLocalId(),
      persistedId: matched?.persistedId ?? "",
      scheduleType: "one_time",
      bookingStatus: matched?.bookingStatus ?? slot.bookingStatus,
      dayOfWeek: "",
      specificDate: slot.specificDate,
      seriesId: slot.seriesId ?? "",
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: String(slot.capacity),
      displayLabel: matched?.displayLabel ?? "",
      applicationCount: matched?.applicationCount ?? 0,
      isReferencedByApplications: false
    }
  })

  return [...preservedSlots, ...nextGeneratedSlots].sort((left, right) => {
    if (left.scheduleType !== right.scheduleType) {
      return left.scheduleType === "weekly" ? -1 : 1
    }

    const leftDate = left.specificDate || `weekly-${left.dayOfWeek}`
    const rightDate = right.specificDate || `weekly-${right.dayOfWeek}`
    const dateCompare = leftDate.localeCompare(rightDate)
    if (dateCompare !== 0) {
      return dateCompare
    }

    return left.startTime.localeCompare(right.startTime)
  })
}

export const summarizeOperatingSlotsForEdit = (
  scheduleSlots: EditableStudioScheduleSlotDraft[],
  todayKey: string
): OperatingHoursSummary => {
  const draft = deriveOperatingDraftFromScheduleSlots(scheduleSlots, todayKey)
  return summarizeCreateScheduleDraft(draft)
}

export const summarizeExistingWeeklySchedules = (scheduleSlots: EditableStudioScheduleSlotDraft[]) => {
  const weeklySlots = scheduleSlots.filter((slot) => slot.scheduleType === "weekly")
  const byWeekday = new Map<number, EditableStudioScheduleSlotDraft[]>()

  for (const slot of weeklySlots) {
    const weekday = Number(slot.dayOfWeek)
    const current = byWeekday.get(weekday) ?? []
    current.push(slot)
    byWeekday.set(weekday, current)
  }

  return [...byWeekday.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([weekday, slots]) => ({
      weekdayLabel: weekdayLabels[weekday] ?? "",
      timeLabels: slots
        .sort((left, right) => left.startTime.localeCompare(right.startTime))
        .map((slot) => `${formatKoreanMeridiemTime(slot.startTime)} ~ ${formatKoreanMeridiemTime(slot.endTime)}`)
    }))
}

export const buildOperatingImpactSummary = (existingSlots: EditableStudioScheduleSlotDraft[], todayKey: string) => {
  const editableFutureSlots = existingSlots.filter(
    (slot) =>
      slot.scheduleType === "one_time" &&
      Boolean(slot.seriesId) &&
      slot.specificDate >= todayKey &&
      !slot.isReferencedByApplications
  )
  const protectedFutureSlots = existingSlots.filter(
    (slot) =>
      slot.scheduleType === "one_time" &&
      slot.specificDate >= todayKey &&
      slot.isReferencedByApplications
  )

  return {
    editableFutureCount: editableFutureSlots.length,
    protectedFutureCount: protectedFutureSlots.length
  }
}
