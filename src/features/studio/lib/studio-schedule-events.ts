import { getStudioSchedulePlacement } from "./studio-schedule-range"
import {
  STUDIO_APPLICATION_STATUS_LABELS,
  STUDIO_APPLICATION_STATUS_TONES,
  type StudioStatusTone
} from "@/features/studio/lib/application-status-labels"
import { toSeoulDateKey } from "@/features/studio/lib/studio-schedule-month"
import type { ApplicationStatus, StudioApplicationSummary } from "@/shared/lib/db/adapter"
import { resolveTrialDisplayStatus } from "@/features/studio/lib/trial-completion"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

export type StudioScheduleEvent = {
  id: string
  scheduleKind: "requested" | "confirmed" | "completed" | "canceled" | "no_show"
  scheduleLabel: string
  isDateUncertain: boolean
  dateKey: string
  startMinutes: number
  endMinutes: number
  durationMinutes: number
  isDurationFallback: boolean
  timeLabel: string
  childName: string
  classId: string
  classTitle: string
  /** 필터 key 는 이름이 아니라 id 다(동명이인 방지). 미배정이면 null. */
  assignedTeacherId: string | null
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

/**
 * 확정 체험이 시작됐으면 배지를 "체험 중" 으로 보여준다. DB status 는 그대로다.
 * 예정 종료 시각이 지나도 계속 "체험 중" 이다 — 완료는 원장만 확정한다.
 * now 는 호출자가 넘긴다 — 서버 렌더와 클라이언트 hydration 이 같은 값을 써야
 * 경계 시각에 라벨이 갈리지 않는다.
 */
const toDisplayStatus = (item: StudioApplicationSummary, now: Date) =>
  resolveTrialDisplayStatus(
    {
      status: item.status,
      noShowAt: item.noShowAt,
      confirmedBlockStartAt: item.confirmedBlockStartAt,
      confirmedBlockEndAt: item.confirmedBlockEndAt,
      confirmedSlotAt: item.confirmedSlotAt,
      scheduleStartTime: item.scheduleStartTime,
      scheduleEndTime: item.scheduleEndTime
    },
    now
  )

export const buildStudioScheduleEvents = (
  items: StudioApplicationSummary[],
  now: Date = new Date()
): StudioScheduleEvent[] => {
  const events: StudioScheduleEvent[] = []

  for (const item of items) {
    const { appointmentAt, recordedAt } = getStudioSchedulePlacement(item)
    const isDateUncertain = !appointmentAt
    // A missing visit time is a record, never an inferred requested appointment.
    if (!appointmentAt && item.status !== "canceled" && item.status !== "completed") continue
    const scheduledAt = appointmentAt ?? recordedAt
    const dateKey = scheduledAt ? toSeoulDateKey(scheduledAt) : ""
    const seoulParts = scheduledAt ? getSeoulDateTimeParts(scheduledAt) : null
    if (scheduledAt && (!dateKey || !seoulParts)) continue
    const scheduleKind = item.status === "new" || item.status === "reviewing" ? "requested"
      : item.status === "canceled" && item.noShowAt ? "no_show" : item.status
    const scheduleLabel = scheduleKind === "requested" ? "희망 일정 · 확정 필요"
      : scheduleKind === "confirmed" ? "확정 일정" : scheduleKind === "completed" ? "체험 완료"
      : scheduleKind === "no_show" ? "노쇼" : "취소"
    const startMinutes = seoulParts ? seoulParts.hour * 60 + seoulParts.minute : 0
    const duration = getScheduleDuration(item.scheduleStartTime, item.scheduleEndTime)

    events.push({
      id: item.id,
      scheduleKind, scheduleLabel, isDateUncertain,
      dateKey: dateKey ?? "",
      startMinutes,
      endMinutes: startMinutes + duration.durationMinutes,
      durationMinutes: duration.durationMinutes,
      isDurationFallback: duration.isDurationFallback,
      timeLabel: formatClockMinutes(startMinutes),
      childName: item.childName,
      classId: item.classId,
      classTitle: item.classTitle?.trim() || "수업 정보 없음",
      assignedTeacherId: item.assignedTeacherId,
      assignedTeacherName: normalizeText(item.assignedTeacherName),
      status: item.status,
      statusLabel: scheduleKind === "requested" ? "확정 필요" : scheduleKind === "confirmed" && toDisplayStatus(item, now) === "confirmed" ? "예약 확정" : STUDIO_APPLICATION_STATUS_LABELS[toDisplayStatus(item, now)],
      tone: item.status === "canceled" ? "gray" : STUDIO_APPLICATION_STATUS_TONES[toDisplayStatus(item, now)],
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


// ── Calendar filters ────────────────────────────────────────────────
//
// 필터링은 현재 범위 event에서 수행하고, 옵션은 서버의 범위 독립 목록을 사용한다.

/** 미배정 일정을 고르기 위한 예약어. 실제 teacher id 와 섞이지 않는다(uuid 가 아니다). */
export const UNASSIGNED_TEACHER_FILTER = "unassigned"
export const ALL_FILTER = "all"

export type StudioScheduleStatusFilter = "all" | "reviewing" | "confirmed" | "completed" | "canceled" | "no_show"

/**
 * Calendar 는 Application Status 를 쓴다. Case Stage 가 아니다.
 * 취소/노쇼는 저장 status를 바꾸지 않고 no_show_at으로 구분한다.
 */
export const STUDIO_SCHEDULE_STATUS_FILTERS: Array<{
  value: StudioScheduleStatusFilter
  label: string
  statuses: ApplicationStatus[]
}> = [
  { value: "all", label: "전체", statuses: [] },
  { value: "reviewing", label: "확인 필요", statuses: ["new", "reviewing"] },
  { value: "confirmed", label: "일정 확정", statuses: ["confirmed"] },
  { value: "completed", label: "체험 완료", statuses: ["completed"] },
  { value: "canceled", label: "취소", statuses: ["canceled"] },
  { value: "no_show", label: "노쇼", statuses: ["canceled"] }
]

const STATUS_FILTER_MAP = new Map(
  STUDIO_SCHEDULE_STATUS_FILTERS.map((option) => [option.value, new Set(option.statuses)])
)

export type StudioScheduleFilterOption = {
  value: string
  label: string
}

export type StudioScheduleFilterOptions = {
  teachers: StudioScheduleFilterOption[]
  classes: StudioScheduleFilterOption[]
}

export type StudioScheduleFilters = {
  teacherId: string
  classId: string
  status: StudioScheduleStatusFilter
}

export const EMPTY_STUDIO_SCHEDULE_FILTERS: StudioScheduleFilters = {
  teacherId: ALL_FILTER,
  classId: ALL_FILTER,
  status: ALL_FILTER
}

export const hasActiveStudioScheduleFilter = (filters: StudioScheduleFilters) =>
  filters.teacherId !== ALL_FILTER ||
  filters.classId !== ALL_FILTER ||
  filters.status !== ALL_FILTER

/**
 * 옵션은 "필터가 걸리지 않은 전체 event" 에서 만든다.
 * 필터 결과에서 만들면 선생님을 고른 순간 수업 옵션이 사라지는 식으로 UI 가 흔들린다.
 */
export const buildStudioScheduleFilterOptions = (
  events: StudioScheduleEvent[]
): StudioScheduleFilterOptions => {
  const teacherLabelById = new Map<string, string>()
  const classLabelById = new Map<string, string>()
  let hasUnassigned = false

  for (const event of events) {
    if (event.assignedTeacherId && event.assignedTeacherName) {
      if (!teacherLabelById.has(event.assignedTeacherId)) {
        teacherLabelById.set(event.assignedTeacherId, event.assignedTeacherName)
      }
    } else {
      hasUnassigned = true
    }

    if (event.classId && !classLabelById.has(event.classId)) {
      classLabelById.set(event.classId, event.classTitle)
    }
  }

  const byLabel = (left: StudioScheduleFilterOption, right: StudioScheduleFilterOption) =>
    left.label.localeCompare(right.label, "ko-KR")

  const teachers: StudioScheduleFilterOption[] = [{ value: ALL_FILTER, label: "전체" }]
  if (hasUnassigned) {
    // 미배정을 목록 위쪽에 둔다. 담당자를 정해야 하는 건이라 먼저 보이는 편이 낫다.
    teachers.push({ value: UNASSIGNED_TEACHER_FILTER, label: "미배정" })
  }
  teachers.push(
    ...Array.from(teacherLabelById, ([value, label]) => ({ value, label })).sort(byLabel)
  )

  const classes: StudioScheduleFilterOption[] = [
    { value: ALL_FILTER, label: "전체" },
    ...Array.from(classLabelById, ([value, label]) => ({ value, label })).sort(byLabel)
  ]

  return { teachers, classes }
}

/** teacher AND class AND status. 원본 배열은 건드리지 않는다. */
export const filterStudioScheduleEvents = (
  events: StudioScheduleEvent[],
  filters: StudioScheduleFilters
): StudioScheduleEvent[] => {
  if (!hasActiveStudioScheduleFilter(filters)) {
    return events
  }

  const statuses = STATUS_FILTER_MAP.get(filters.status)

  return events.filter((event) => {
    if (filters.teacherId === UNASSIGNED_TEACHER_FILTER) {
      if (event.assignedTeacherId) {
        return false
      }
    } else if (filters.teacherId !== ALL_FILTER && event.assignedTeacherId !== filters.teacherId) {
      return false
    }

    if (filters.classId !== ALL_FILTER && event.classId !== filters.classId) {
      return false
    }

    if (filters.status === "canceled" && event.scheduleKind === "no_show") return false
    if (filters.status === "no_show" && event.scheduleKind !== "no_show") return false
    if (statuses && statuses.size > 0 && !statuses.has(event.status)) {
      return false
    }

    return true
  })
}
