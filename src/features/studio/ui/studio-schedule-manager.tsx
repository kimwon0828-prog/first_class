"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import {
  getStudioStatusLabel,
  getStudioStatusTone
} from "@/features/studio/lib/application-status-labels"
import {
  SEOUL_WEEKDAY_SHORT_LABELS,
  buildMonthGrid,
  formatMonthLabel,
  formatSelectedDateLabel,
  getSeoulTodayKey,
  isSameMonth,
  shiftMonthKey,
  toMonthStartKey,
  toSeoulDateKey,
  toSeoulTimeLabel
} from "@/features/studio/lib/studio-schedule-month"
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-schedule-manager.module.css"

type StudioScheduleManagerProps = {
  items: StudioApplicationSummary[]
}

const PROGRAM_TYPE_LABELS: Record<NonNullable<StudioApplicationSummary["classProgramType"]>, string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

/** 캘린더에 표시할 시각. 확정 일정이 있으면 그것이 우선이다. */
const getScheduledAt = (item: StudioApplicationSummary) =>
  item.confirmedSlotAt ?? item.requestedSlotAt ?? null

const normalizeText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const formatPhone = (value: string | null) => (value?.trim() ? value : "-")

const getSecondaryScheduleLabel = (item: StudioApplicationSummary) => {
  const selectedLabel = normalizeText(item.selectedScheduleLabel)
  if (!selectedLabel) {
    return null
  }

  if (item.requestedSlotAt) {
    return `선택 시간: ${selectedLabel}`
  }

  return selectedLabel
}

/** 상태 tone → 이벤트 좌측 indicator. Application Status 의미를 그대로 쓴다. */
const EVENT_TONE_CLASS: Record<string, string> = {
  green: styles.eventToneGreen,
  amber: styles.eventToneAmber,
  blue: styles.eventToneBlue,
  gray: styles.eventToneGray,
  red: styles.eventToneRed
}

type CalendarEvent = {
  item: StudioApplicationSummary
  scheduledAt: string
  dateKey: string
  timeLabel: string
}

const MAX_EVENTS_PER_CELL = 3

export const StudioScheduleManager = ({ items }: StudioScheduleManagerProps) => {
  // 브라우저 로컬 오늘이 아니라 서울 오늘이다.
  const todayKey = useMemo(() => getSeoulTodayKey(), [])
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const [visibleMonthKey, setVisibleMonthKey] = useState(() => toMonthStartKey(todayKey))
  const [pendingApplicationId, setPendingApplicationId] = useState<string | null>(null)

  // 표시 조건은 "취소가 아니고, 표시할 시각이 있다" 뿐이다.
  // 담당 선생님이 없다는 이유로 실제 일정을 캘린더에서 숨기지 않는다.
  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = []

    for (const item of items) {
      if (item.status === "canceled") {
        continue
      }

      const scheduledAt = getScheduledAt(item)
      if (!scheduledAt) {
        continue
      }

      const dateKey = toSeoulDateKey(scheduledAt)
      const timeLabel = toSeoulTimeLabel(scheduledAt)
      if (!dateKey || !timeLabel) {
        continue
      }

      events.push({ item, scheduledAt, dateKey, timeLabel })
    }

    // DB 반환 순서에 의존하지 않는다. 원본 items 는 건드리지 않는다.
    return events.sort(
      (left, right) =>
        left.scheduledAt.localeCompare(right.scheduledAt) || left.item.id.localeCompare(right.item.id)
    )
  }, [items])

  // 날짜별 1회 grouping. 셀마다 전체 배열을 다시 훑지 않는다.
  const eventsByDateKey = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>()

    for (const event of calendarEvents) {
      const current = grouped.get(event.dateKey)
      if (current) {
        current.push(event)
      } else {
        grouped.set(event.dateKey, [event])
      }
    }

    return grouped
  }, [calendarEvents])

  const monthCells = useMemo(() => buildMonthGrid(visibleMonthKey), [visibleMonthKey])

  // Alert 는 지금 보고 있는 달을 기준으로 센다.
  const monthAlerts = useMemo(() => {
    let needsReview = 0
    let unassigned = 0

    for (const event of calendarEvents) {
      if (!isSameMonth(event.dateKey, visibleMonthKey)) {
        continue
      }

      if (event.item.status === "new" || event.item.status === "reviewing") {
        needsReview += 1
      }

      if (!normalizeText(event.item.assignedTeacherName)) {
        unassigned += 1
      }
    }

    return { needsReview, unassigned }
  }, [calendarEvents, visibleMonthKey])

  const eventsForSelectedDay = eventsByDateKey.get(selectedDateKey) ?? []

  const goToToday = () => {
    setVisibleMonthKey(toMonthStartKey(todayKey))
    setSelectedDateKey(todayKey)
  }

  const moveMonth = (offset: number) => {
    const nextMonthKey = shiftMonthKey(visibleMonthKey, offset)
    setVisibleMonthKey(nextMonthKey)
    setSelectedDateKey(nextMonthKey)
  }

  return (
    <div className={styles.root}>
      <section className={styles.canvas} aria-label="월간 캘린더">
        <header className={styles.canvasHeader}>
          <h2 className={styles.monthLabel}>{formatMonthLabel(visibleMonthKey)}</h2>
          <div className={styles.canvasNav}>
            <button type="button" className={styles.navButton} onClick={goToToday}>
              오늘
            </button>
            <button
              type="button"
              className={styles.navIconButton}
              onClick={() => moveMonth(-1)}
              aria-label="이전 달"
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.navIconButton}
              onClick={() => moveMonth(1)}
              aria-label="다음 달"
            >
              ›
            </button>
          </div>
        </header>

        {monthAlerts.needsReview > 0 || monthAlerts.unassigned > 0 ? (
          <div className={styles.alertRow}>
            {monthAlerts.needsReview > 0 ? (
              <span className={`${styles.alert} ${styles.alertAmber}`}>
                확인 필요한 신청 {monthAlerts.needsReview}건
              </span>
            ) : null}
            {monthAlerts.unassigned > 0 ? (
              <span className={`${styles.alert} ${styles.alertGray}`}>
                선생님 미배정 {monthAlerts.unassigned}건
              </span>
            ) : null}
          </div>
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
            const visibleEvents = dayEvents.slice(0, MAX_EVENTS_PER_CELL)
            const overflowCount = dayEvents.length - visibleEvents.length

            return (
              <div
                key={cell.key}
                className={[
                  styles.cell,
                  !cell.isCurrentMonth ? styles.cellMuted : "",
                  cell.key === selectedDateKey ? styles.cellSelected : "",
                  cell.key === todayKey ? styles.cellToday : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* 셀 전체가 날짜 선택 영역이다. 이벤트 링크는 이 위에 얹힌다. */}
                <button
                  type="button"
                  className={styles.cellSelect}
                  onClick={() => setSelectedDateKey(cell.key)}
                  aria-label={`${formatSelectedDateLabel(cell.key)} 선택`}
                  aria-pressed={cell.key === selectedDateKey}
                />

                <span className={styles.cellHead}>
                  <span className={styles.cellDay}>{cell.day}</span>
                  {cell.key === todayKey ? <span className={styles.todayMark}>오늘</span> : null}
                </span>

                {visibleEvents.length > 0 ? (
                  <span className={styles.cellEvents}>
                    {visibleEvents.map((event) => (
                      <Link
                        key={event.item.id}
                        href={`/studio/applications/${event.item.id}`}
                        className={styles.event}
                        title={`${event.timeLabel} ${event.item.childName} · ${
                          event.item.classTitle ?? ""
                        } · ${getStudioStatusLabel(event.item)}`}
                        aria-busy={pendingApplicationId === event.item.id}
                        onClick={() => setPendingApplicationId(event.item.id)}
                      >
                        <span
                          className={`${styles.eventTone} ${
                            EVENT_TONE_CLASS[getStudioStatusTone(event.item)] ?? styles.eventToneGray
                          }`}
                          aria-hidden="true"
                        />
                        <span className={styles.eventTime}>{event.timeLabel}</span>
                        <span className={styles.eventName}>{event.item.childName}</span>
                      </Link>
                    ))}
                    {overflowCount > 0 ? (
                      <span className={styles.eventMore}>외 {overflowCount}건</span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      </section>

      <section className={styles.detailSection} aria-label="선택 날짜 일정">
        <div className={styles.detailHeader}>
          <h3 className={styles.detailTitle}>{formatSelectedDateLabel(selectedDateKey)} 일정</h3>
          <span className={styles.detailCount}>{eventsForSelectedDay.length}건</span>
        </div>

        {eventsForSelectedDay.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>선택한 날짜에 등록된 일정이 없어요.</p>
            <p className={styles.emptyDescription}>
              신청을 확정하면 이곳에서 일정을 확인할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className={styles.timeline}>
            {eventsForSelectedDay.map((event) => {
              const { item } = event
              const selectedLabel = getSecondaryScheduleLabel(item)
              const programLabel = item.classProgramType
                ? PROGRAM_TYPE_LABELS[item.classProgramType]
                : null
              const timeMeta = item.confirmedSlotAt ? "확정 일정" : "희망 일정"
              const assignedTeacherLabel = normalizeText(item.assignedTeacherName)

              return (
                <article key={item.id} className={styles.timelineItem}>
                  <div className={styles.timeCol}>
                    <span className={styles.timeText}>{event.timeLabel}</span>
                    <span className={styles.timeSub}>{timeMeta}</span>
                  </div>

                  <div className={styles.eventCard}>
                    <div className={styles.badgeRow}>
                      <StudioStatusBadge tone={getStudioStatusTone(item)}>
                        {getStudioStatusLabel(item)}
                      </StudioStatusBadge>
                      {programLabel ? <span className={styles.programPill}>{programLabel}</span> : null}
                    </div>

                    <strong className={styles.eventCardTitle}>{item.childName}</strong>
                    <p className={styles.eventCardSubtitle}>
                      {item.classTitle} · {item.childGrade}
                    </p>
                    {selectedLabel ? <p className={styles.eventNote}>{selectedLabel}</p> : null}

                    <dl className={styles.metaGrid}>
                      <div className={styles.metaRow}>
                        <dt className={styles.metaLabel}>보호자</dt>
                        <dd className={styles.metaValue}>{item.parentName ?? "-"}</dd>
                      </div>
                      <div className={styles.metaRow}>
                        <dt className={styles.metaLabel}>보호자 연락처</dt>
                        <dd className={styles.metaValue}>{formatPhone(item.parentPhone)}</dd>
                      </div>
                      <div className={styles.metaRow}>
                        <dt className={styles.metaLabel}>담당 선생님</dt>
                        <dd className={styles.metaValue}>
                          {assignedTeacherLabel ?? (
                            <span className={styles.metaMuted}>미배정</span>
                          )}
                        </dd>
                      </div>
                    </dl>

                    <div className={styles.eventFooter}>
                      <Link
                        href={`/studio/applications/${item.id}`}
                        className={styles.linkButton}
                        aria-busy={pendingApplicationId === item.id}
                        onClick={() => setPendingApplicationId(item.id)}
                      >
                        {pendingApplicationId === item.id ? "이동 중..." : "신청 상세 보기"}
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
