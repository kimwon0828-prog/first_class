// /studio/schedule 의 URL 상태.
//
// refresh / back-forward / 링크 공유에서 살아남아야 하는 것만 URL 에 둔다:
//   view · date · teacherId · classId · status
//
// ⚠️ 잘못된 값이 와도 화면이 깨지지 않아야 한다.
//   유효성 검사는 DB 를 더 조회하지 않고, 이미 만들어진 options collection 안에서만 한다.

import {
  ALL_FILTER,
  STUDIO_SCHEDULE_STATUS_FILTERS,
  type StudioScheduleFilterOptions,
  type StudioScheduleFilters,
  type StudioScheduleStatusFilter
} from "@/features/studio/lib/studio-schedule-events"
import { parseDateKey } from "@/features/studio/lib/studio-schedule-month"

export type CalendarView = "day" | "week" | "month"

export type StudioScheduleUrlState = {
  view: CalendarView
  /** null 이면 호출부가 "서울 오늘" 을 쓴다. */
  dateKey: string | null
  teacherId: string
  classId: string
  status: StudioScheduleStatusFilter
}

export type StudioScheduleSearchParams = Record<string, string | string[] | undefined>

const VIEW_VALUES: CalendarView[] = ["day", "week", "month"]
const STATUS_VALUES = new Set(STUDIO_SCHEDULE_STATUS_FILTERS.map((option) => option.value))

const readParam = (params: StudioScheduleSearchParams, key: string) => {
  const raw = params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === "string" ? value.trim() : ""
}

/** 서버(searchParams)와 클라이언트(URLSearchParams) 모두 같은 규칙으로 읽는다. */
export const parseStudioScheduleUrlState = (
  params: StudioScheduleSearchParams
): StudioScheduleUrlState => {
  const view = readParam(params, "view")
  const date = readParam(params, "date")
  const status = readParam(params, "status")

  return {
    view: (VIEW_VALUES as string[]).includes(view) ? (view as CalendarView) : "month",
    dateKey: parseDateKey(date) ? date : null,
    teacherId: readParam(params, "teacherId") || ALL_FILTER,
    classId: readParam(params, "classId") || ALL_FILTER,
    status: STATUS_VALUES.has(status as StudioScheduleStatusFilter)
      ? (status as StudioScheduleStatusFilter)
      : ALL_FILTER
  }
}

export const searchParamsToRecord = (params: URLSearchParams): StudioScheduleSearchParams =>
  Object.fromEntries(params.entries())

/**
 * URL 에서 읽은 필터를 실제 존재하는 옵션에만 맞춘다.
 * 지워진 선생님/수업 id 가 남아 있어도 "전체" 로 떨어질 뿐 화면은 그대로 뜬다.
 */
export const resolveStudioScheduleFilters = (
  state: StudioScheduleUrlState,
  options: StudioScheduleFilterOptions
): StudioScheduleFilters => {
  const teacherValues = new Set(options.teachers.map((option) => option.value))
  const classValues = new Set(options.classes.map((option) => option.value))

  // options.teachers 에는 "전체"/"미배정"도 들어 있으므로 존재 여부 검사 하나로 충분하다.
  return {
    teacherId: teacherValues.has(state.teacherId) ? state.teacherId : ALL_FILTER,
    classId: classValues.has(state.classId) ? state.classId : ALL_FILTER,
    status: state.status
  }
}

/** 기본값은 URL 에 남기지 않는다. 주소가 짧게 유지된다. */
export const buildStudioScheduleQuery = (state: {
  view: CalendarView
  dateKey: string
  filters: StudioScheduleFilters
}) => {
  const params = new URLSearchParams()

  if (state.view !== "month") {
    params.set("view", state.view)
  }

  params.set("date", state.dateKey)

  if (state.filters.teacherId !== ALL_FILTER) {
    params.set("teacherId", state.filters.teacherId)
  }

  if (state.filters.classId !== ALL_FILTER) {
    params.set("classId", state.filters.classId)
  }

  if (state.filters.status !== ALL_FILTER) {
    params.set("status", state.filters.status)
  }

  const query = params.toString()
  return query ? `?${query}` : ""
}
