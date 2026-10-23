"use client"

import { useRouter } from "next/navigation"
import { useCallback, useMemo, useState, useTransition } from "react"

import {
  EMPTY_STUDIO_SCHEDULE_FILTERS,
  STUDIO_SCHEDULE_STATUS_FILTERS,
  buildStudioScheduleEvents,
  buildStudioScheduleFilterOptions,
  filterStudioScheduleEvents,
  hasActiveStudioScheduleFilter,
  type StudioScheduleEvent,
  type StudioScheduleFilterOption,
  type StudioScheduleFilterOptions,
  type StudioScheduleFilters
} from "@/features/studio/lib/studio-schedule-events"
import {
  SEOUL_WEEKDAY_SHORT_LABELS,
  buildMonthGrid,
  formatMonthLabel,
  formatSelectedDateLabel,
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
  resolveStudioScheduleFilters,
  type CalendarView,
  type StudioScheduleUrlState
} from "@/features/studio/lib/studio-schedule-url-state"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import { mergeBookingClosureRanges, visibleScheduleClassOptions, type BookingClosure } from "../lib/booking-closures"
import { BookingTimeDialog, bookingTimeLabel } from "./booking-time-dialog"
import { StudioClassesScheduleHeader } from "./studio-classes-schedule-header"
import { StudioDetailLink } from "./studio-detail-link"
import { StudioQueryRetry } from "./studio-query-retry"
import { V2Button } from "./v2/v2-button"
import { V2ChevronDownIcon, V2ChevronLeftIcon, V2ChevronRightIcon, V2InfoIcon } from "./v2/v2-icons"
import { V2StatusBadge } from "./v2/v2-status-badge"
import styles from "./studio-schedule-manager.module.css"

type StudioScheduleManagerProps = {
  initialClosures?: BookingClosure[]
  closuresError?: string | null
  filterOptions?: StudioScheduleFilterOptions
  items: StudioApplicationSummary[]
  error?: string | null
  initialUrlState: StudioScheduleUrlState
  /** 서버가 정한 기준 시각. 체험 종료 표시가 hydration 전후로 달라지지 않게 한다. */
  nowIso: string
  /** 수업·일정 머리(하위 탭 · 예약 시간 관리 · 수업 등록). */
  header: { classesHref: string; scheduleHref: string; newClassHref: string }
}

const VIEW_LABELS: Array<{ value: CalendarView; label: string }> = [
  { value: "day", label: "일" },
  { value: "week", label: "주" },
  { value: "month", label: "월" }
]

const MAX_EVENTS_PER_MONTH_CELL = 3

const groupEventsByDate = (events: StudioScheduleEvent[]) => {
  const grouped = new Map<string, StudioScheduleEvent[]>()
  for (const event of events) {
    const current = grouped.get(event.dateKey)
    if (current) current.push(event)
    else grouped.set(event.dateKey, [event])
  }
  return grouped
}

const weekdayOf = (dateKey: string) => {
  const civil = parseDateKey(dateKey)
  return civil ? toWeekday(toDayNumber(civil)) : 0
}

/** 일정 확정이 필요한 신청(신규 · 검토 중). 카드 주황 테두리와 위 알림이 같은 조건을 쓴다. */
const needsConfirmation = (event: StudioScheduleEvent) => event.status === "new" || event.status === "reviewing"
const needsTeacher = (event: StudioScheduleEvent) =>
  !event.assignedTeacherId && ["new", "reviewing", "confirmed"].includes(event.status)

/** "10월 17일(토) – 23일(금)" · "10월 17일(토)" · "2026년 10월" */
const formatPeriodLabel = (view: CalendarView, anchorDateKey: string, weekDateKeys: string[]) => {
  if (view === "month") return formatMonthLabel(toMonthStartKey(anchorDateKey))
  const format = (dateKey: string, withMonth: boolean) => {
    const civil = parseDateKey(dateKey)
    if (!civil) return dateKey
    return `${withMonth ? `${civil.month}월 ` : ""}${civil.day}일(${SEOUL_WEEKDAY_SHORT_LABELS[weekdayOf(dateKey)]})`
  }
  if (view === "day") return format(anchorDateKey, true)
  const first = weekDateKeys[0] ?? anchorDateKey
  const last = weekDateKeys[weekDateKeys.length - 1] ?? anchorDateKey
  return `${format(first, true)} – ${format(last, first.slice(0, 7) !== last.slice(0, 7))}`
}

/* 필터 선택 (Figma 2178:258): "선생님 · 전체" 처럼 이름과 값을 한 칸에. 브라우저 select 를 그대로 덮어 쓴다. */
const FilterSelect = ({
  label,
  options,
  value,
  onChange
}: {
  label: string
  options: StudioScheduleFilterOption[]
  value: string
  onChange: (next: string) => void
}) => (
  <label className={styles.filterSelect}>
    <span className={styles.filterSelectText}>
      {label} · {options.find((option) => option.value === value)?.label ?? "전체"}
    </span>
    <V2ChevronDownIcon size={14} className={styles.filterSelectIcon} />
    <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
)

/* 신청 카드 (Figma 2178:276): 시간 · 학생 · 학년 · 수업 · 담당 · 상태. 누르면 신청 상세. */
const ScheduleCard = ({ event }: { event: StudioScheduleEvent }) => {
  const grade = event.childGrade ? getChildGradeLabel(event.childGrade) ?? event.childGrade : null
  const teacher = event.assignedTeacherName ?? "담당 미배정"
  const title = `${event.timeLabel} · ${event.statusLabel} · ${event.childName} · ${event.classTitle} · ${teacher}`
  return (
    <StudioDetailLink
      internalPath={event.detailHref}
      className={`${styles.card} ${needsConfirmation(event) ? styles.cardNeedsConfirm : ""} ${
        event.status === "canceled" ? styles.cardCanceled : ""
      }`}
      title={title}
      aria-label={title}
    >
      <span className={styles.cardTime}>{event.timeLabel}</span>
      <span className={styles.cardName}>{grade ? `${event.childName} · ${grade}` : event.childName}</span>
      <span className={styles.cardMeta}>{event.classTitle}</span>
      <span className={`${styles.cardMeta} ${needsTeacher(event) ? styles.cardUnassigned : ""}`}>{teacher}</span>
      <V2StatusBadge tone={event.tone}>{event.statusLabel}</V2StatusBadge>
    </StudioDetailLink>
  )
}

export const StudioScheduleManager = ({
  items,
  error,
  initialUrlState,
  nowIso,
  filterOptions: suppliedFilterOptions,
  initialClosures = [],
  closuresError,
  header
}: StudioScheduleManagerProps) => {
  // "오늘" 도 서버가 정한 기준 시각에서 뽑는다. 달력 강조와 체험 종료 표시가 같은 시각을 본다.
  const todayKey = useMemo(() => getSeoulTodayKey(new Date(nowIso)), [nowIso])
  const router = useRouter()
  const [isNavigating, startNavigation] = useTransition()
  const anchorDateKey = initialUrlState.dateKey ?? todayKey
  const view = initialUrlState.view
  const [bookingDate, setBookingDate] = useState<string | null>(null)
  const [bookingClass, setBookingClass] = useState<string | null>(null)
  const [closureOverrides, setClosureOverrides] = useState<Record<string, BookingClosure[]>>({})
  const updateClosures = useCallback(
    (dateKey: string, rows: BookingClosure[]) => {
      setClosureOverrides((current) => ({ ...current, [dateKey]: rows }))
      router.refresh()
    },
    [router]
  )

  const baseEvents = useMemo(() => buildStudioScheduleEvents(items, new Date(nowIso)), [items, nowIso])
  const allClosures = useMemo(
    () => [...initialClosures.filter((c) => !(c.dateKey in closureOverrides)), ...Object.values(closureOverrides).flat()],
    [initialClosures, closureOverrides]
  )
  // 옵션은 필터가 걸리지 않은 전체 event 에서 만든다(§18).
  const filterOptions = useMemo(() => {
    const options = suppliedFilterOptions ?? buildStudioScheduleFilterOptions(baseEvents)
    return {
      ...options,
      classes: visibleScheduleClassOptions(options.classes, baseEvents.map((e) => e.classId), allClosures)
    }
  }, [suppliedFilterOptions, baseEvents, allClosures])
  const [filterState, setFilters] = useState<StudioScheduleFilters>(() => resolveStudioScheduleFilters(initialUrlState, filterOptions))
  const filters = resolveStudioScheduleFilters({ ...initialUrlState, ...filterState }, filterOptions)
  // Closures are class/academy scope. Teacher/status filters cannot hide them.
  const visibleClosures = mergeBookingClosureRanges(
    allClosures.filter((c) => filters.classId === "all" || !c.classId || c.classId === filters.classId)
  )
  const openBooking = (date: string, classId: string | null = filters.classId === "all" ? null : filters.classId) => {
    setBookingClass(classId)
    setBookingDate(date)
  }
  const closureLabel = (c: BookingClosure) =>
    `${bookingTimeLabel(c)} 예약 마감 · ${
      c.classId
        ? `${filterOptions.classes.find((o) => o.value === c.classId)?.label ?? "특정 수업"}${c.selectionScope === "public" ? " (전체 공개 수업)" : ""}`
        : "기존 학원 전체"
    }`

  const calendarEvents = useMemo(() => filterStudioScheduleEvents(baseEvents, filters), [baseEvents, filters])
  const datedEvents = useMemo(() => calendarEvents.filter((event) => !event.isDateUncertain), [calendarEvents])
  const uncertainEvents = calendarEvents.filter((event) => event.isDateUncertain)
  const eventsByDateKey = useMemo(() => groupEventsByDate(datedEvents), [datedEvents])
  const visibleMonthKey = toMonthStartKey(anchorDateKey)
  const monthCells = useMemo(() => buildMonthGrid(visibleMonthKey), [visibleMonthKey])
  const weekDateKeys = useMemo(() => getWeekDateKeys(anchorDateKey), [anchorDateKey])
  const visibleDateKeys = useMemo(() => (view === "day" ? [anchorDateKey] : weekDateKeys), [anchorDateKey, view, weekDateKeys])

  const periodEvents = useMemo(() => {
    if (view === "month") return datedEvents.filter((event) => isSameMonth(event.dateKey, visibleMonthKey))
    const visibleDates = new Set(visibleDateKeys)
    return datedEvents.filter((event) => visibleDates.has(event.dateKey))
  }, [datedEvents, view, visibleDateKeys, visibleMonthKey])

  const alerts = useMemo(() => {
    let needsReview = 0
    let unassigned = 0
    for (const event of periodEvents) {
      if (needsConfirmation(event)) needsReview += 1
      if (needsTeacher(event)) unassigned += 1
    }
    return { needsReview, unassigned }
  }, [periodEvents])

  const periodLabel = formatPeriodLabel(view, anchorDateKey, weekDateKeys)

  // Date/view changes refetch the server range; local filters reuse that bounded result.
  const syncUrl = useCallback(
    (next: { view: CalendarView; dateKey: string; filters: StudioScheduleFilters }, mode: "push" | "replace") => {
      if (typeof window === "undefined") return
      const url = `${window.location.pathname}${buildStudioScheduleQuery(next)}`
      if (mode === "push") startNavigation(() => router.push(url, { scroll: false }))
      else window.history.replaceState(null, "", url)
    },
    [router]
  )

  // view 전환과 기간 이동은 뒤로 가기로 되돌릴 수 있어야 한다. 필터는 replace 로 누적을 막는다.
  const applyNavigation = (next: { view?: CalendarView; dateKey?: string }) => {
    syncUrl({ view: next.view ?? view, dateKey: next.dateKey ?? anchorDateKey, filters }, "push")
  }

  const applyFilters = (nextFilters: StudioScheduleFilters) => {
    setFilters(nextFilters)
    syncUrl({ view, dateKey: anchorDateKey, filters: nextFilters }, "replace")
  }

  const movePeriod = (offset: -1 | 1) => {
    if (view === "month") {
      applyNavigation({ dateKey: shiftMonthKey(visibleMonthKey, offset) })
      return
    }
    applyNavigation({ dateKey: shiftDateKey(anchorDateKey, view === "week" ? offset * 7 : offset) })
  }

  const renderDayColumn = (dateKey: string, wide: boolean) => {
    const events = eventsByDateKey.get(dateKey) ?? []
    const closures = visibleClosures.filter((c) => c.dateKey === dateKey)
    const weekday = weekdayOf(dateKey)
    return (
      <div key={dateKey} className={`${styles.day} ${wide ? styles.dayWide : ""}`}>
        <button
          type="button"
          className={styles.dayHead}
          aria-label={`${formatSelectedDateLabel(dateKey)} 예약 시간 관리`}
          onClick={() => openBooking(dateKey)}
        >
          <span className={weekday === 0 ? styles.sunday : styles.weekday}>{SEOUL_WEEKDAY_SHORT_LABELS[weekday]}</span>
          <strong>{parseDateKey(dateKey)?.day}</strong>
          {dateKey === todayKey ? <span className={styles.todayMark}>오늘</span> : null}
        </button>
        {closures.map((c) => (
          <button key={c.id} type="button" className={styles.closure} title={closureLabel(c)} onClick={() => openBooking(dateKey, c.classId)}>
            {closureLabel(c)}
          </button>
        ))}
        {events.length === 0 ? <span className={styles.dayEmpty}>체험 없음</span> : null}
        <div className={wide ? styles.dayCardsWide : styles.dayCards}>
          {events.map((event) => (
            <ScheduleCard key={event.id} event={event} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root} aria-busy={isNavigating}>
      <StudioClassesScheduleHeader
        active="schedule"
        description="학부모 신청과 확정된 체험 일정을 한눈에 봐요."
        classesHref={header.classesHref}
        scheduleHref={header.scheduleHref}
        newClassHref={header.newClassHref}
        onOpenBookingTimes={() => openBooking(anchorDateKey)}
      />

      {error ? (
        <div className={styles.errorCard} role="alert">
          <p>{error}</p>
          <StudioQueryRetry />
        </div>
      ) : null}
      {closuresError ? (
        <div className={styles.errorCard} role="alert">
          <p>{closuresError}</p>
          <StudioQueryRetry />
        </div>
      ) : null}

      <section className={styles.toolbar} aria-label="기간 탐색 및 필터">
        <div className={styles.periodNav}>
          <V2Button
            variant="ghost"
            size="sm"
            icon={<V2ChevronLeftIcon size={16} />}
            onClick={() => movePeriod(-1)}
            aria-label={view === "month" ? "이전 달" : view === "week" ? "이전 주" : "이전 날"}
          />
          {/* 기간 글자를 누르면 날짜 선택. 고른 날짜는 이동 버튼과 같은 URL 날짜 상태(push)로 간다. */}
          <div className={styles.periodPicker}>
            <h2 className={styles.periodLabel}>{periodLabel}</h2>
            <input
              type="date"
              className={styles.periodInput}
              aria-label="날짜 선택"
              value={anchorDateKey}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.()
                } catch {
                  // 지원하지 않는 브라우저는 기본 동작(입력 칸 포커스)으로 둔다.
                }
              }}
              onChange={(event) => {
                if (event.target.value) applyNavigation({ dateKey: event.target.value })
              }}
            />
          </div>
          <V2Button
            variant="ghost"
            size="sm"
            icon={<V2ChevronRightIcon size={16} />}
            onClick={() => movePeriod(1)}
            aria-label={view === "month" ? "다음 달" : view === "week" ? "다음 주" : "다음 날"}
          />
        </div>
        <V2Button variant="outline" size="sm" onClick={() => applyNavigation({ dateKey: getSeoulTodayKey() })}>
          오늘
        </V2Button>
        <div className={styles.segment} role="group" aria-label="캘린더 보기 방식">
          {VIEW_LABELS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`${styles.segmentItem} ${view === option.value ? styles.segmentItemActive : ""}`}
              onClick={() => applyNavigation({ view: option.value })}
              aria-pressed={view === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.filters}>
          <FilterSelect
            label="선생님"
            options={filterOptions.teachers}
            value={filters.teacherId}
            onChange={(next) => applyFilters({ ...filters, teacherId: next })}
          />
          <FilterSelect
            label="수업"
            options={filterOptions.classes}
            value={filters.classId}
            onChange={(next) => applyFilters({ ...filters, classId: next })}
          />
          <FilterSelect
            label="상태"
            options={STUDIO_SCHEDULE_STATUS_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
            value={filters.status}
            onChange={(next) => applyFilters({ ...filters, status: next as StudioScheduleFilters["status"] })}
          />
          {hasActiveStudioScheduleFilter(filters) ? (
            <V2Button variant="ghost" size="sm" onClick={() => applyFilters(EMPTY_STUDIO_SCHEDULE_FILTERS)}>
              필터 초기화
            </V2Button>
          ) : null}
        </div>
      </section>

      {isNavigating ? (
        <p className={styles.status} role="status">
          일정을 불러오는 중이에요.
        </p>
      ) : null}

      {alerts.needsReview > 0 || alerts.unassigned > 0 ? (
        <div className={styles.alertRow}>
          {alerts.needsReview > 0 ? <V2StatusBadge tone="amber">확인 필요한 신청 {alerts.needsReview}건</V2StatusBadge> : null}
          {alerts.unassigned > 0 ? <V2StatusBadge tone="gray">선생님 미배정 {alerts.unassigned}건</V2StatusBadge> : null}
        </div>
      ) : null}

      {error ? null : view === "month" ? (
        <section className={styles.month} aria-label={`${periodLabel} 캘린더`}>
          <div className={styles.monthWeekdays} aria-hidden="true">
            {SEOUL_WEEKDAY_SHORT_LABELS.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
          <div className={styles.monthGrid}>
            {monthCells.map((cell) => {
              const dayEvents = eventsByDateKey.get(cell.key) ?? []
              const shownEvents = dayEvents.slice(0, MAX_EVENTS_PER_MONTH_CELL)
              const overflowCount = dayEvents.length - shownEvents.length
              return (
                <div
                  key={cell.key}
                  className={[
                    styles.monthCell,
                    !cell.isCurrentMonth ? styles.monthCellMuted : "",
                    cell.key === todayKey ? styles.monthCellToday : ""
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <button
                    type="button"
                    className={styles.monthCellSelect}
                    onClick={() => applyNavigation({ view: "day", dateKey: cell.key })}
                    aria-label={`${formatSelectedDateLabel(cell.key)} 일간 보기`}
                  />
                  <span className={styles.monthCellHead}>
                    <button
                      type="button"
                      className={styles.monthDay}
                      aria-label={`${formatSelectedDateLabel(cell.key)} 예약 시간 관리`}
                      onClick={() => openBooking(cell.key)}
                    >
                      {cell.day}
                    </button>
                    {cell.key === todayKey ? <span className={styles.todayMark}>오늘</span> : null}
                  </span>
                  {visibleClosures
                    .filter((c) => c.dateKey === cell.key)
                    .map((c) => (
                      <button key={c.id} type="button" className={styles.closure} onClick={() => openBooking(cell.key, c.classId)} title={closureLabel(c)}>
                        {closureLabel(c)}
                      </button>
                    ))}
                  {shownEvents.map((event) => (
                    <StudioDetailLink
                      key={event.id}
                      internalPath={event.detailHref}
                      className={`${styles.monthEvent} ${needsConfirmation(event) ? styles.monthEventNeedsConfirm : ""} ${
                        event.status === "canceled" ? styles.cardCanceled : ""
                      }`}
                      title={`${event.timeLabel} ${event.childName} · ${event.classTitle} · ${event.statusLabel}`}
                    >
                      <span className={styles.monthEventTime}>{event.timeLabel}</span>
                      <span className={styles.monthEventName}>{event.childName}</span>
                      <V2StatusBadge tone={event.tone}>{event.statusLabel}</V2StatusBadge>
                    </StudioDetailLink>
                  ))}
                  {overflowCount > 0 ? <span className={styles.monthMore}>+{overflowCount}개 더보기</span> : null}
                </div>
              )
            })}
          </div>
          {periodEvents.length === 0 ? <p className={styles.emptyNote}>이 달에 예정된 일정이 없어요.</p> : null}
        </section>
      ) : (
        <section className={styles.week} aria-label={`${periodLabel} 캘린더`}>
          <div className={view === "week" ? styles.weekGrid : styles.dayGrid}>
            {visibleDateKeys.map((dateKey) => renderDayColumn(dateKey, view === "day"))}
          </div>
          {periodEvents.length === 0 ? <p className={styles.emptyNote}>이 기간에 예정된 일정이 없어요.</p> : null}
        </section>
      )}

      {!error && uncertainEvents.length > 0 ? (
        <details className={styles.uncertainRecords}>
          <summary>방문 날짜 확인 필요 · {uncertainEvents.length}건</summary>
          <p>확정 시각이 남아 있지 않은 기록입니다. 표시된 날짜는 처리일이며 방문일이 아닙니다. 처리일도 없는 기록은 기간과 관계없이 표시합니다.</p>
          {uncertainEvents.map((event) => (
            <StudioDetailLink key={event.id} internalPath={event.detailHref}>
              {event.scheduleLabel} · {event.childName} · {event.classTitle} · {event.dateKey ? `처리일 ${event.dateKey}` : "처리일 미확인"}
            </StudioDetailLink>
          ))}
        </details>
      ) : null}

      <p className={styles.legend}>
        <V2InfoIcon size={14} />
        카드를 누르면 신청 상세로 가요. 날짜를 누르면 그날 예약 시간을 마감하거나 해제할 수 있어요. 주황 테두리는 일정 확정이 필요한 신청이에요.
      </p>

      {bookingDate ? (
        <BookingTimeDialog
          key={`${bookingDate}/${bookingClass}`}
          dateKey={bookingDate}
          initialClassId={bookingClass}
          todayKey={todayKey}
          onClose={() => setBookingDate(null)}
          onChange={updateClosures}
        />
      ) : null}
    </div>
  )
}
