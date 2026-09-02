"use client"

import Link from "next/link"
import { useMemo, useState, type CSSProperties } from "react"

import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"
import {
  buildStudioScheduleEvents,
  buildStudioScheduleTimeRange,
  formatClockMinutes,
  layoutOverlappingEvents,
  type PositionedStudioScheduleEvent,
  type StudioScheduleEvent
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
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-schedule-manager.module.css"

type CalendarView = "day" | "week" | "month"

type StudioScheduleManagerProps = {
  items: StudioApplicationSummary[]
  error?: string | null
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
                  className={`${styles.timeColumn} ${dateKey === todayKey ? styles.timeColumnToday : ""}`}
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

export const StudioScheduleManager = ({ items, error }: StudioScheduleManagerProps) => {
  const todayKey = useMemo(() => getSeoulTodayKey(), [])
  const [anchorDateKey, setAnchorDateKey] = useState(todayKey)
  const [view, setView] = useState<CalendarView>("month")

  const calendarEvents = useMemo(() => buildStudioScheduleEvents(items), [items])
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

  const movePeriod = (offset: -1 | 1) => {
    if (view === "month") {
      setAnchorDateKey(shiftMonthKey(visibleMonthKey, offset))
      return
    }

    setAnchorDateKey(shiftDateKey(anchorDateKey, view === "week" ? offset * 7 : offset))
  }

  const selectMonthDate = (dateKey: string) => {
    setAnchorDateKey(dateKey)
    setView("day")
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
              onClick={() => setView(option.value)}
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

      <section className={styles.canvas} aria-label={`${periodLabel} 캘린더`}>
        <header className={styles.canvasHeader}>
          <h2 className={styles.periodLabel}>{periodLabel}</h2>
          <div className={styles.canvasNav}>
            <button type="button" className={styles.navButton} onClick={() => setAnchorDateKey(todayKey)}>
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
  )
}
