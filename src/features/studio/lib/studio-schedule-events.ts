import {
  getStudioStatusLabel,
  getStudioStatusTone,
  type StudioStatusTone
} from "@/features/studio/lib/application-status-labels"
import { toSeoulDateKey } from "@/features/studio/lib/studio-schedule-month"
import type { ApplicationStatus, StudioApplicationSummary } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

export type StudioScheduleEvent = {
  id: string
  dateKey: string
  startMinutes: number
  endMinutes: number
  durationMinutes: number
  isDurationFallback: boolean
  timeLabel: string
  childName: string
  classTitle: string
  assignedTeacherName: string | null
  status: ApplicationStatus
  statusLabel: string
  tone: StudioStatusTone
  detailHref: string
}

export type PositionedStudioScheduleEvent = StudioScheduleEvent & {
  columnIndex: number
  columnCount: number
}

export type StudioScheduleTimeRange = {
  startMinutes: number
  endMinutes: number
  hourMarkers: number[]
}

const DEFAULT_DURATION_MINUTES = 60
const DEFAULT_GRID_START_MINUTES = 8 * 60
const DEFAULT_GRID_END_MINUTES = 22 * 60
const MINUTES_PER_DAY = 24 * 60
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::\d{2})?$/

const normalizeText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const parseScheduleTimeMinutes = (value: string | null | undefined) => {
  const match = value ? TIME_PATTERN.exec(value.trim()) : null
  if (!match) {
    return null
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour * 60 + minute
}

export const getScheduleDuration = (
  startTime: string | null | undefined,
  endTime: string | null | undefined
) => {
  const scheduleStartMinutes = parseScheduleTimeMinutes(startTime)
  const scheduleEndMinutes = parseScheduleTimeMinutes(endTime)

  // class_schedules_time_check(end_time > start_time)와 같은 의미를 따른다.
  // join 누락 또는 legacy invalid 값만 60분 fallback으로 표시한다.
  if (
    scheduleStartMinutes == null ||
    scheduleEndMinutes == null ||
    scheduleEndMinutes <= scheduleStartMinutes
  ) {
    return { durationMinutes: DEFAULT_DURATION_MINUTES, isDurationFallback: true }
  }

  return {
    durationMinutes: scheduleEndMinutes - scheduleStartMinutes,
    isDurationFallback: false
  }
}

export const formatClockMinutes = (minutes: number) => {
  const clamped = Math.min(Math.max(Math.round(minutes), 0), MINUTES_PER_DAY)
  if (clamped === MINUTES_PER_DAY) {
    return "24:00"
  }

  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`
}

export const buildStudioScheduleEvents = (
  items: StudioApplicationSummary[]
): StudioScheduleEvent[] => {
  const events: StudioScheduleEvent[] = []

  for (const item of items) {
    if (item.status === "canceled") {
      continue
    }

    const scheduledAt = item.confirmedSlotAt ?? item.requestedSlotAt ?? null
    if (!scheduledAt) {
      continue
    }

    const dateKey = toSeoulDateKey(scheduledAt)
    const seoulParts = getSeoulDateTimeParts(scheduledAt)
    if (!dateKey || !seoulParts) {
      continue
    }

    const startMinutes = seoulParts.hour * 60 + seoulParts.minute
    const duration = getScheduleDuration(item.scheduleStartTime, item.scheduleEndTime)

    events.push({
      id: item.id,
      dateKey,
      startMinutes,
      endMinutes: startMinutes + duration.durationMinutes,
      durationMinutes: duration.durationMinutes,
      isDurationFallback: duration.isDurationFallback,
      timeLabel: formatClockMinutes(startMinutes),
      childName: item.childName,
      classTitle: item.classTitle?.trim() || "수업 정보 없음",
      assignedTeacherName: normalizeText(item.assignedTeacherName),
      status: item.status,
      statusLabel: getStudioStatusLabel(item),
      tone: getStudioStatusTone(item),
      detailHref: `/studio/applications/${item.id}`
    })
  }

  return events.sort(
    (left, right) =>
      left.dateKey.localeCompare(right.dateKey) ||
      left.startMinutes - right.startMinutes ||
      left.id.localeCompare(right.id)
  )
}

type ActiveColumn = {
  endMinutes: number
  columnIndex: number
}

class MinHeap<T> {
  private values: T[] = []

  constructor(private readonly compare: (left: T, right: T) => number) {}

  get size() {
    return this.values.length
  }

  peek() {
    return this.values[0] ?? null
  }

  clear() {
    this.values = []
  }

  push(value: T) {
    this.values.push(value)
    let index = this.values.length - 1

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (this.compare(this.values[parentIndex], this.values[index]) <= 0) {
        break
      }

      ;[this.values[parentIndex], this.values[index]] = [
        this.values[index],
        this.values[parentIndex]
      ]
      index = parentIndex
    }
  }

  pop(): T | null {
    const first = this.values[0]
    const last = this.values.pop()
    if (first === undefined) {
      return null
    }

    if (this.values.length > 0 && last !== undefined) {
      this.values[0] = last
      let index = 0

      while (true) {
        const leftIndex = index * 2 + 1
        const rightIndex = leftIndex + 1
        let smallestIndex = index

        if (
          leftIndex < this.values.length &&
          this.compare(this.values[leftIndex], this.values[smallestIndex]) < 0
        ) {
          smallestIndex = leftIndex
        }
        if (
          rightIndex < this.values.length &&
          this.compare(this.values[rightIndex], this.values[smallestIndex]) < 0
        ) {
          smallestIndex = rightIndex
        }
        if (smallestIndex === index) {
          break
        }

        ;[this.values[index], this.values[smallestIndex]] = [
          this.values[smallestIndex],
          this.values[index]
        ]
        index = smallestIndex
      }
    }

    return first
  }
}

/** Sweep-line + heap 기반 O(n log n) overlap column 배정. */
export const layoutOverlappingEvents = (
  events: StudioScheduleEvent[]
): PositionedStudioScheduleEvent[] => {
  const sorted = [...events].sort(
    (left, right) =>
      left.startMinutes - right.startMinutes ||
      left.endMinutes - right.endMinutes ||
      left.id.localeCompare(right.id)
  )
  const activeColumns = new MinHeap<ActiveColumn>(
    (left, right) => left.endMinutes - right.endMinutes || left.columnIndex - right.columnIndex
  )
  const freeColumns = new MinHeap<number>((left, right) => left - right)
  const positioned: PositionedStudioScheduleEvent[] = []
  let nextColumnIndex = 0
  let groupStartIndex = 0
  let groupColumnCount = 0

  const finishGroup = () => {
    for (let index = groupStartIndex; index < positioned.length; index += 1) {
      positioned[index].columnCount = groupColumnCount
    }
    groupStartIndex = positioned.length
    groupColumnCount = 0
  }

  for (const event of sorted) {
    while (activeColumns.peek() && activeColumns.peek()!.endMinutes <= event.startMinutes) {
      const released = activeColumns.pop()
      if (released) {
        freeColumns.push(released.columnIndex)
      }
    }

    if (activeColumns.size === 0 && positioned.length > groupStartIndex) {
      finishGroup()
      freeColumns.clear()
      nextColumnIndex = 0
    }

    const columnIndex = freeColumns.pop() ?? nextColumnIndex++
    activeColumns.push({ endMinutes: event.endMinutes, columnIndex })
    groupColumnCount = Math.max(groupColumnCount, activeColumns.size)
    positioned.push({ ...event, columnIndex, columnCount: 1 })
  }

  finishGroup()
  return positioned
}

export const buildStudioScheduleTimeRange = (
  events: StudioScheduleEvent[]
): StudioScheduleTimeRange => {
  let startMinutes = DEFAULT_GRID_START_MINUTES
  let endMinutes = DEFAULT_GRID_END_MINUTES

  if (events.length > 0) {
    const earliestStart = Math.min(...events.map((event) => event.startMinutes))
    const latestEnd = Math.max(...events.map((event) => event.endMinutes))
    startMinutes = Math.min(startMinutes, Math.floor(earliestStart / 60) * 60 - 60)
    endMinutes = Math.max(endMinutes, Math.ceil(latestEnd / 60) * 60 + 60)
  }

  startMinutes = Math.max(0, startMinutes)
  endMinutes = Math.min(MINUTES_PER_DAY, endMinutes)

  return {
    startMinutes,
    endMinutes,
    hourMarkers: Array.from(
      { length: Math.floor((endMinutes - startMinutes) / 60) + 1 },
      (_, index) => startMinutes + index * 60
    )
  }
}
