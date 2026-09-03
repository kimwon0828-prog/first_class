"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react"

import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"
import {
  EMPTY_STUDIO_SCHEDULE_FILTERS,
  STUDIO_SCHEDULE_STATUS_FILTERS,
  buildStudioScheduleEvents,
  buildStudioScheduleFilterOptions,
  buildStudioScheduleTimeRange,
  filterStudioScheduleEvents,
  formatClockMinutes,
  hasActiveStudioScheduleFilter,
  layoutOverlappingEvents,
  type PositionedStudioScheduleEvent,
  type StudioScheduleEvent,
  type StudioScheduleFilterOption,
  type StudioScheduleFilters
} from "@/features/studio/lib/studio-schedule-events"
import {
  SEOUL_WEEKDAY_SHORT_LABELS,
  buildMonthGrid,
  formatDayLabel,
  formatMonthLabel,
  formatSelectedDateLabel,
  formatWeekLabel,
  getSeoulTodayKey,
  getWeekDateKeys,
  isSameMonth,
  parseDateKey,
  shiftDateKey,
  shiftMonthKey,
  toDayNumber,
  toMonthStartKey,
  toWeekday
} from "@/features/studio/lib/studio-schedule-month"
import {
  buildStudioScheduleQuery,
  parseStudioScheduleUrlState,
  resolveStudioScheduleFilters,
  searchParamsToRecord,
  type CalendarView,
  type StudioScheduleUrlState
} from "@/features/studio/lib/studio-schedule-url-state"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-schedule-manager.module.css"

type StudioScheduleManagerProps = {
  items: StudioApplicationSummary[]
  error?: string | null
  initialUrlState: StudioScheduleUrlState
  /** 서버가 정한 기준 시각. 체험 종료 표시가 hydration 전후로 달라지지 않게 한다. */
  nowIso: string
}

type EventStyle = CSSProperties & {
  "--event-top": string
  "--event-height": string
  "--event-left": string
  "--event-width": string
}

type GridStyle = CSSProperties & {
  "--grid-height": string
  "--time-column-count": string
}

type MarkerStyle = CSSProperties & {
  "--marker-top": string
}

const VIEW_LABELS: Array<{ value: CalendarView; label: string }> = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" }
]

const MONTH_TONE_CLASS: Record<StudioStatusTone, string> = {
  green: styles.monthToneGreen,
  amber: styles.monthToneAmber,
  blue: styles.monthToneBlue,
  gray: styles.monthToneGray,
  red: styles.monthToneRed
}

const TIME_TONE_CLASS: Record<StudioStatusTone, string> = {
  green: styles.timeToneGreen,
  amber: styles.timeToneAmber,
  blue: styles.timeToneBlue,
  gray: styles.timeToneGray,
  red: styles.timeToneRed
}

const MAX_EVENTS_PER_MONTH_CELL = 3
const PIXELS_PER_HOUR = 64

const groupEventsByDate = (events: StudioScheduleEvent[]) => {
  const grouped = new Map<string, StudioScheduleEvent[]>()

  for (const event of events) {
    const current = grouped.get(event.dateKey)
    if (current) {
      current.push(event)
    } else {
      grouped.set(event.dateKey, [event])
    }
  }

  return grouped
}

const getWeekdayLabel = (dateKey: string) => {
  const civil = parseDateKey(dateKey)
  if (!civil) {
    return dateKey
  }

  return SEOUL_WEEKDAY_SHORT_LABELS[toWeekday(toDayNumber(civil))]
}

const getDayNumberLabel = (dateKey: string) => parseDateKey(dateKey)?.day ?? dateKey

const CalendarEventBlock = ({
  event,
  rangeStart,
  rangeEnd,
  compact
}: {
  event: PositionedStudioScheduleEvent
  rangeStart: number
  rangeEnd: number
  compact: boolean
}) => {
  const rangeMinutes = rangeEnd - rangeStart
  const visibleStart = Math.max(event.startMinutes, rangeStart)
  const visibleEnd = Math.min(event.endMinutes, rangeEnd)
  const eventStyle: EventStyle = {
    "--event-top": `${((visibleStart - rangeStart) / rangeMinutes) * 100}%`,
    "--event-height": `${((visibleEnd - visibleStart) / rangeMinutes) * 100}%`,
    "--event-left": `${(event.columnIndex / event.columnCount) * 100}%`,
    "--event-width": `${100 / event.columnCount}%`
  }
  const title = `${event.timeLabel} · ${event.statusLabel} · ${event.childName} · ${event.classTitle} · ${event.assignedTeacherName ?? "미배정"}`

  return (
    <Link
      href={event.detailHref}
      className={`${styles.timeEvent} ${TIME_TONE_CLASS[event.tone]} ${
        compact ? styles.timeEventCompact : ""
      }`}
      style={eventStyle}
      title={title}
      aria-label={title}
    >
      <span className={styles.timeEventHead}>
        <span className={styles.timeEventTime}>{event.timeLabel}</span>
        <span className={styles.timeEventStatus}>{event.statusLabel}</span>
      </span>
      <span className={styles.timeEventName}>{event.childName}</span>
      <span className={styles.timeEventClass}>{event.classTitle}</span>
      <span className={styles.timeEventTeacher}>{event.assignedTeacherName ?? "선생님 미배정"}</span>
    </Link>
  )
}

const TimeGrid = ({
  dateKeys,
  eventsByDateKey,
  todayKey,
  compact
}: {
  dateKeys: string[]
  eventsByDateKey: Map<string, StudioScheduleEvent[]>
  todayKey: string
  compact: boolean
}) => {
  const visibleEvents = dateKeys.flatMap((dateKey) => eventsByDateKey.get(dateKey) ?? [])
  const timeRange = buildStudioScheduleTimeRange(visibleEvents)
  const gridStyle: GridStyle = {
    "--grid-height": `${((timeRange.endMinutes - timeRange.startMinutes) / 60) * PIXELS_PER_HOUR}px`,
    "--time-column-count": String(dateKeys.length)
  }

  return (
    <div className={styles.timeGridScroll}>
      <div className={compact ? styles.weekTimeGrid : styles.dayTimeGrid}>
        <div className={styles.timeGridHeader} style={gridStyle}>
          <span className={styles.timeGridCorner} aria-hidden="true" />
          {dateKeys.map((dateKey) => (
            <div
              key={dateKey}
              className={`${styles.timeGridDateHead} ${
                dateKey === todayKey ? styles.timeGridDateHeadToday : ""
              }`}
            >
              <span>{getWeekdayLabel(dateKey)}요일</span>
              <strong>{getDayNumberLabel(dateKey)}</strong>
            </div>
          ))}
        </div>

        <div className={styles.timeGridBody} style={gridStyle}>
          <div className={styles.timeAxis}>
            {timeRange.hourMarkers.map((minutes) => {
              const markerStyle: MarkerStyle = {
                "--marker-top": `${((minutes - timeRange.startMinutes) /
                  (timeRange.endMinutes - timeRange.startMinutes)) *
                  100}%`
              }

              return (
                <span key={minutes} className={styles.timeLabel} style={markerStyle}>
                  {formatClockMinutes(minutes)}
                </span>
              )
            })}
          </div>

          <div className={styles.timeColumns}>
            {dateKeys.map((dateKey) => {
              const positionedEvents = layoutOverlappingEvents(eventsByDateKey.get(dateKey) ?? [])

              return (
                <div
                  key={dateKey}
                  className={`${styles.timeColumn} ${
                    // 열이 여러 개일 때만 오늘을 칠한다. Day View 는 열이 하나라 grid 전체가 물든다.
                    dateKeys.length > 1 && dateKey === todayKey ? styles.timeColumnToday : ""
                  }`}
                >
                  {timeRange.hourMarkers.map((minutes) => {
                    const markerStyle: MarkerStyle = {
                      "--marker-top": `${((minutes - timeRange.startMinutes) /
                        (timeRange.endMinutes - timeRange.startMinutes)) *
                        100}%`
                    }

                    return <span key={minutes} className={styles.hourLine} style={markerStyle} />
                  })}
                  {positionedEvents.map((event) => (
                    <CalendarEventBlock
                      key={event.id}
                      event={event}
                      rangeStart={timeRange.startMinutes}
                      rangeEnd={timeRange.endMinutes}
                      compact={compact}
                    />
                  ))}
                </div>
              )
            })}
          </div>

          {visibleEvents.length === 0 ? (
            <p className={styles.timeGridEmpty}>이 기간에 예정된 일정이 없습니다.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

const MiniCalendar = ({
  monthKey,
  anchorDateKey,
  todayKey,
  onMoveMonth,
  onSelectDate
}: {
  monthKey: string
  anchorDateKey: string
  todayKey: string
  onMoveMonth: (offset: -1 | 1) => void
  onSelectDate: (dateKey: string) => void
}) => {
  const cells = useMemo(() => buildMonthGrid(monthKey), [monthKey])

  return (
    <section className={styles.mini} aria-label="날짜 이동">
      <header className={styles.miniHeader}>
        <button
          type="button"
          className={styles.miniNavButton}
          onClick={() => onMoveMonth(-1)}
          aria-label="이전 달"
        >
          ‹
        </button>
        <span className={styles.miniMonth}>{formatMonthLabel(monthKey)}</span>
        <button
          type="button"
          className={styles.miniNavButton}
          onClick={() => onMoveMonth(1)}
          aria-label="다음 달"
        >
          ›
        </button>
      </header>

      <div className={styles.miniWeekdayRow} aria-hidden="true">
        {SEOUL_WEEKDAY_SHORT_LABELS.map((label) => (
          <span key={label} className={styles.miniWeekday}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.miniGrid}>
        {cells.map((cell) => (
          <button
            key={cell.key}
            type="button"
            className={[
              styles.miniDay,
              !cell.isCurrentMonth ? styles.miniDayMuted : "",
              cell.key === anchorDateKey ? styles.miniDaySelected : "",
              cell.key === todayKey ? styles.miniDayToday : ""
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelectDate(cell.key)}
            aria-label={formatSelectedDateLabel(cell.key)}
            aria-pressed={cell.key === anchorDateKey}
            aria-current={cell.key === todayKey ? "date" : undefined}
          >
            {cell.day}
          </button>
        ))}
      </div>
    </section>
  )
}

/** 선생님/수업이 늘어나도 좌측 패널이 끝없이 길어지지 않도록 기본 노출을 제한한다. */
const DEFAULT_VISIBLE_FILTER_OPTIONS = 5

const FilterGroup = ({
  name,
  legend,
  options,
  value,
  onChange,
  maxVisibleOptions
}: {
  name: string
  legend: string
  options: StudioScheduleFilterOption[]
  value: string
  onChange: (next: string) => void
  /** 생략하면 접지 않는다(상태 필터처럼 항목 수가 고정된 그룹). */
  maxVisibleOptions?: number
}) => {
  const [expanded, setExpanded] = useState(false)

  const { visibleOptions, hiddenCount } = useMemo(() => {
    if (maxVisibleOptions == null || expanded) {
      return { visibleOptions: options, hiddenCount: 0 }
    }

    // 첫 항목("전체")은 항상 보인다. 제한은 실제 선택지에만 건다.
    const [allOption, ...rest] = options
    if (rest.length <= maxVisibleOptions) {
      return { visibleOptions: options, hiddenCount: 0 }
    }

    const head = rest.slice(0, maxVisibleOptions)
    // 선택된 항목이 잘려 나가면 화면에서 무엇이 걸렸는지 알 수 없다. 그때만 뒤에 붙인다.
    const selected = rest.find((option) => option.value === value)
    const shown = selected && !head.includes(selected) ? [...head, selected] : head

    return {
      visibleOptions: allOption ? [allOption, ...shown] : shown,
      hiddenCount: rest.length - shown.length
    }
  }, [expanded, maxVisibleOptions, options, value])

  return (
    <fieldset className={styles.filterGroup}>
      <legend className={styles.filterLegend}>{legend}</legend>
      <div className={styles.filterOptions}>
        {visibleOptions.map((option) => (
          <label key={option.value} className={styles.filterOption}>
            <input
              type="radio"
              name={name}
              className={styles.filterRadio}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.filterOptionLabel}>{option.label}</span>
          </label>
        ))}
      </div>

      {hiddenCount > 0 || expanded ? (
        <button
          type="button"
          className={styles.filterMore}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? "접기" : `더 보기 ${hiddenCount}개`}
        </button>
      ) : null}
    </fieldset>
  )
}

export const StudioScheduleManager = ({
  items,
  error,
  initialUrlState,
  nowIso
}: StudioScheduleManagerProps) => {
  // "오늘" 도 서버가 정한 기준 시각에서 뽑는다. 달력 강조와 체험 종료 표시가 같은 시각을 본다.
  const todayKey = useMemo(() => getSeoulTodayKey(new Date(nowIso)), [nowIso])
  const [anchorDateKey, setAnchorDateKey] = useState(initialUrlState.dateKey ?? todayKey)
  const [view, setView] = useState<CalendarView>(initialUrlState.view)
  // Mini Calendar 가 보고 있는 달. anchor 와 따로 움직일 수 있지만 anchor 이동에는 항상 따라간다.
  const [miniMonthKey, setMiniMonthKey] = useState(() =>
    toMonthStartKey(initialUrlState.dateKey ?? todayKey)
  )

  const baseEvents = useMemo(
    () => buildStudioScheduleEvents(items, new Date(nowIso)),
    [items, nowIso]
  )
  // 옵션은 필터가 걸리지 않은 전체 event 에서 만든다(§18).
  const filterOptions = useMemo(() => buildStudioScheduleFilterOptions(baseEvents), [baseEvents])
  const [filters, setFilters] = useState<StudioScheduleFilters>(() =>
    resolveStudioScheduleFilters(initialUrlState, buildStudioScheduleFilterOptions(baseEvents))
  )

  const calendarEvents = useMemo(
    () => filterStudioScheduleEvents(baseEvents, filters),
    [baseEvents, filters]
  )
  const eventsByDateKey = useMemo(() => groupEventsByDate(calendarEvents), [calendarEvents])
  const visibleMonthKey = toMonthStartKey(anchorDateKey)
  const monthCells = useMemo(() => buildMonthGrid(visibleMonthKey), [visibleMonthKey])
  const weekDateKeys = useMemo(() => getWeekDateKeys(anchorDateKey), [anchorDateKey])
  const visibleDateKeys = useMemo(
    () => (view === "day" ? [anchorDateKey] : weekDateKeys),
    [anchorDateKey, view, weekDateKeys]
  )

  const periodEvents = useMemo(() => {
    if (view === "month") {
      return calendarEvents.filter((event) => isSameMonth(event.dateKey, visibleMonthKey))
    }

    const visibleDates = new Set(visibleDateKeys)
    return calendarEvents.filter((event) => visibleDates.has(event.dateKey))
  }, [calendarEvents, view, visibleDateKeys, visibleMonthKey])

  const alerts = useMemo(() => {
    let needsReview = 0
    let unassigned = 0

    for (const event of periodEvents) {
      if (event.status === "new" || event.status === "reviewing") {
        needsReview += 1
      }
      if (!event.assignedTeacherName) {
        unassigned += 1
      }
    }

    return { needsReview, unassigned }
  }, [periodEvents])

  const periodLabel =
    view === "month"
      ? formatMonthLabel(visibleMonthKey)
      : view === "week"
        ? formatWeekLabel(anchorDateKey)
        : formatDayLabel(anchorDateKey)

  /**
   * URL 쓰기는 router 대신 history API 를 쓴다.
   * router.push/replace 는 server component 를 다시 실행해 신청 목록을 매번 재조회하지만,
   * 여기서 바뀌는 것은 표시 상태뿐이라 서버 왕복이 필요 없다(Next.js 가 공식 지원하는 방식).
   */
  const syncUrl = useCallback(
    (next: { view: CalendarView; dateKey: string; filters: StudioScheduleFilters }, mode: "push" | "replace") => {
      if (typeof window === "undefined") {
        return
      }

      const url = `${window.location.pathname}${buildStudioScheduleQuery(next)}`
      if (mode === "push") {
        window.history.pushState(null, "", url)
      } else {
        window.history.replaceState(null, "", url)
      }
    },
    []
  )

  // view 전환과 기간 이동은 뒤로 가기로 되돌릴 수 있어야 한다. 필터는 replace 로 누적을 막는다.
  const applyNavigation = (next: { view?: CalendarView; dateKey?: string }) => {
    const nextView = next.view ?? view
    const nextDateKey = next.dateKey ?? anchorDateKey

    setView(nextView)
    setAnchorDateKey(nextDateKey)
    setMiniMonthKey(toMonthStartKey(nextDateKey))
    syncUrl({ view: nextView, dateKey: nextDateKey, filters }, "push")
  }

  const applyFilters = (nextFilters: StudioScheduleFilters) => {
    setFilters(nextFilters)
    syncUrl({ view, dateKey: anchorDateKey, filters: nextFilters }, "replace")
  }

  // 뒤로/앞으로 가기. URL 이 곧 상태이므로 다시 읽어 반영한다.
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const state = parseStudioScheduleUrlState(searchParamsToRecord(params))
      const nextDateKey = state.dateKey ?? todayKey

      setView(state.view)
      setAnchorDateKey(nextDateKey)
      setMiniMonthKey(toMonthStartKey(nextDateKey))
      setFilters(resolveStudioScheduleFilters(state, filterOptions))
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [filterOptions, todayKey])

  const movePeriod = (offset: -1 | 1) => {
    if (view === "month") {
      applyNavigation({ dateKey: shiftMonthKey(visibleMonthKey, offset) })
      return
    }

    applyNavigation({
      dateKey: shiftDateKey(anchorDateKey, view === "week" ? offset * 7 : offset)
    })
  }

  const selectMonthDate = (dateKey: string) => {
    applyNavigation({ view: "day", dateKey })
  }

  // Mini Calendar 는 날짜 이동만 한다. 현재 view 를 바꾸지 않는다.
  const selectMiniDate = (dateKey: string) => {
    applyNavigation({ dateKey })
  }

  const moveMiniMonth = (offset: -1 | 1) => {
    setMiniMonthKey(shiftMonthKey(miniMonthKey, offset))
  }

  return (
    <div className={styles.root}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <h1 className={styles.pageTitle}>일정 관리</h1>
          <p className={styles.pageSubtitle}>학부모 신청과 확정된 체험 일정을 확인해요.</p>
        </div>
        <div className={styles.viewControl} aria-label="캘린더 보기 방식">
          {VIEW_LABELS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.viewButton} ${view === option.value ? styles.viewButtonActive : ""}`}
              onClick={() => applyNavigation({ view: option.value })}
              aria-pressed={view === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {error ? (
        <div className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </div>
      ) : null}

      <div className={styles.workspace}>
        <aside className={styles.sidebarPanel} aria-label="날짜 및 필터">
          <MiniCalendar
            monthKey={miniMonthKey}
            anchorDateKey={anchorDateKey}
            todayKey={todayKey}
            onMoveMonth={moveMiniMonth}
            onSelectDate={selectMiniDate}
          />

          <div className={styles.filterPanel}>
            <FilterGroup
              name="schedule-teacher"
              legend="선생님"
              options={filterOptions.teachers}
              value={filters.teacherId}
              onChange={(next) => applyFilters({ ...filters, teacherId: next })}
              maxVisibleOptions={DEFAULT_VISIBLE_FILTER_OPTIONS}
            />
            <FilterGroup
              name="schedule-class"
              legend="수업"
              options={filterOptions.classes}
              value={filters.classId}
              onChange={(next) => applyFilters({ ...filters, classId: next })}
              maxVisibleOptions={DEFAULT_VISIBLE_FILTER_OPTIONS}
            />
            <FilterGroup
              name="schedule-status"
              legend="상태"
              options={STUDIO_SCHEDULE_STATUS_FILTERS.map((option) => ({
                value: option.value,
                label: option.label
              }))}
              value={filters.status}
              onChange={(next) =>
                applyFilters({
                  ...filters,
                  status: next as StudioScheduleFilters["status"]
                })
              }
            />

            {hasActiveStudioScheduleFilter(filters) ? (
              <button
                type="button"
                className={styles.filterReset}
                onClick={() => applyFilters(EMPTY_STUDIO_SCHEDULE_FILTERS)}
              >
                필터 초기화
              </button>
            ) : null}
          </div>
        </aside>

        <section className={styles.canvas} aria-label={`${periodLabel} 캘린더`}>
          <header className={styles.canvasHeader}>
            <h2 className={styles.periodLabel}>{periodLabel}</h2>
            <div className={styles.canvasNav}>
              <button
                type="button"
                className={styles.navButton}
                onClick={() => applyNavigation({ dateKey: todayKey })}
              >
                오늘
              </button>
              <button
                type="button"
                className={styles.navIconButton}
                onClick={() => movePeriod(-1)}
                aria-label={view === "month" ? "이전 달" : view === "week" ? "이전 주" : "이전 날"}
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.navIconButton}
                onClick={() => movePeriod(1)}
                aria-label={view === "month" ? "다음 달" : view === "week" ? "다음 주" : "다음 날"}
              >
                ›
              </button>
            </div>
          </header>

          {alerts.needsReview > 0 || alerts.unassigned > 0 ? (
            <div className={styles.alertRow}>
              {alerts.needsReview > 0 ? (
                <span className={`${styles.alert} ${styles.alertAmber}`}>
                  확인 필요한 신청 {alerts.needsReview}건
                </span>
              ) : null}
              {alerts.unassigned > 0 ? (
                <span className={`${styles.alert} ${styles.alertGray}`}>
                  선생님 미배정 {alerts.unassigned}건
                </span>
              ) : null}
            </div>
          ) : null}

          {view === "month" ? (
            <>
              {periodEvents.length === 0 ? (
                <p className={styles.calendarEmptyNote}>이 달에 예정된 일정이 없습니다.</p>
              ) : null}
              <div className={styles.weekdayRow} aria-hidden="true">
                {SEOUL_WEEKDAY_SHORT_LABELS.map((label) => (
                  <span key={label} className={styles.weekdayCell}>
                    {label}
                  </span>
                ))}
              </div>
              <div className={styles.monthGrid}>
                {monthCells.map((cell) => {
                  const dayEvents = eventsByDateKey.get(cell.key) ?? []
                  const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_MONTH_CELL)
                  const overflowCount = dayEvents.length - visibleEvents.length

                  return (
                    <div
                      key={cell.key}
                      className={[
                        styles.cell,
                        !cell.isCurrentMonth ? styles.cellMuted : "",
                        cell.key === anchorDateKey ? styles.cellSelected : "",
                        cell.key === todayKey ? styles.cellToday : ""
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        className={styles.cellSelect}
                        onClick={() => selectMonthDate(cell.key)}
                        aria-label={`${formatSelectedDateLabel(cell.key)} 일간 보기`}
                      />
                      <span className={styles.cellHead}>
                        <span className={styles.cellDay}>{cell.day}</span>
                        {cell.key === todayKey ? <span className={styles.todayMark}>오늘</span> : null}
                      </span>
                      {visibleEvents.length > 0 ? (
                        <span className={styles.cellEvents}>
                          {visibleEvents.map((event) => (
                            <Link
                              key={event.id}
                              href={event.detailHref}
                              className={styles.monthEvent}
                              title={`${event.timeLabel} ${event.childName} · ${event.classTitle} · ${event.statusLabel}`}
                            >
                              <span className={`${styles.monthEventTone} ${MONTH_TONE_CLASS[event.tone]}`} />
                              <span className={styles.monthEventTime}>{event.timeLabel}</span>
                              <span className={styles.monthEventName}>{event.childName}</span>
                            </Link>
                          ))}
                          {overflowCount > 0 ? (
                            <span className={styles.eventMore}>+{overflowCount}개 더보기</span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <TimeGrid
              dateKeys={visibleDateKeys}
              eventsByDateKey={eventsByDateKey}
              todayKey={todayKey}
              compact={view === "week"}
            />
            )}
        </section>
      </div>
    </div>
  )
}
