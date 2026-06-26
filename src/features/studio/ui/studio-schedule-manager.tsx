"use client"

import Link from "next/link"
import { useMemo, useState } from "react"

import type { ApplicationStatus, StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./studio-schedule-manager.module.css"

type StudioScheduleManagerProps = {
  items: StudioApplicationSummary[]
}

const toLocalYmd = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const startOfLocalDay = (ymd: string) => new Date(`${ymd}T00:00:00`)

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const endOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0)

const formatTime = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeStyle: "short"
  }).format(new Date(value))

const formatMonthLabel = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long"
  }).format(date)

const formatSelectedDateLabel = (ymd: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(startOfLocalDay(ymd))

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const

const PROGRAM_TYPE_LABELS: Record<NonNullable<StudioApplicationSummary["classProgramType"]>, string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

const getBoardDateValue = (item: StudioApplicationSummary) =>
  item.confirmedSlotAt ?? item.requestedSlotAt ?? null

const hasVisibleDate = (item: StudioApplicationSummary) => Boolean(getBoardDateValue(item))

const isPendingStatus = (status: ApplicationStatus) => status === "new" || status === "reviewing"

const getStatusBadge = (status: ApplicationStatus) => {
  if (status === "confirmed") {
    return { label: "확정", tone: "infoSoft" as const }
  }

  if (status === "completed") {
    return { label: "완료", tone: "successSoft" as const }
  }

  return { label: "검토 중", tone: "warningSoft" as const }
}

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

const getAssignedTeacherLabel = (item: StudioApplicationSummary) => {
  const teacherName = normalizeText(item.assignedTeacherName)
  if (teacherName) {
    return teacherName
  }

  return "미배정"
}

const compareScheduledAt = (left: StudioApplicationSummary, right: StudioApplicationSummary) => {
  const leftValue = getBoardDateValue(left)
  const rightValue = getBoardDateValue(right)

  if (!leftValue || !rightValue) {
    return 0
  }

  return leftValue.localeCompare(rightValue)
}

const buildMonthDays = (baseDate: Date) => {
  const firstDay = startOfMonth(baseDate)
  const lastDay = endOfMonth(baseDate)
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - firstDay.getDay())
  const endDate = new Date(lastDay)
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  const days: { key: string; date: Date; isCurrentMonth: boolean }[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    const date = new Date(cursor)
    days.push({
      key: toLocalYmd(date),
      date,
      isCurrentMonth: date.getMonth() === baseDate.getMonth()
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

type DaySummary = {
  total: number
  pendingCount: number
  confirmedCount: number
  completedCount: number
}

export const StudioScheduleManager = ({ items }: StudioScheduleManagerProps) => {
  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => toLocalYmd(today), [today])
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey)
  const [visibleMonthDate, setVisibleMonthDate] = useState(() => startOfMonth(today))

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => item.status !== "canceled")
      .filter(hasVisibleDate)
      .sort(compareScheduledAt)
  }, [items])

  const daySummaryMap = useMemo(() => {
    const summary = new Map<string, DaySummary>()

    for (const item of visibleItems) {
      const scheduledAt = getBoardDateValue(item)
      if (!scheduledAt) {
        continue
      }

      const key = toLocalYmd(new Date(scheduledAt))
      const current = summary.get(key) ?? {
        total: 0,
        pendingCount: 0,
        confirmedCount: 0,
        completedCount: 0
      }

      current.total += 1
      if (isPendingStatus(item.status)) {
        current.pendingCount += 1
      } else if (item.status === "confirmed") {
        current.confirmedCount += 1
      } else if (item.status === "completed") {
        current.completedCount += 1
      }

      summary.set(key, current)
    }

    return summary
  }, [visibleItems])

  const monthDays = useMemo(() => buildMonthDays(visibleMonthDate), [visibleMonthDate])

  const monthMetrics = useMemo(() => {
    const monthStart = startOfMonth(visibleMonthDate)
    const monthEnd = new Date(monthStart)
    monthEnd.setMonth(monthEnd.getMonth() + 1)

    const monthItems = visibleItems.filter((item) => {
      const scheduledAt = getBoardDateValue(item)
      if (!scheduledAt) {
        return false
      }

      const date = new Date(scheduledAt)
      return date >= monthStart && date < monthEnd
    })

    return {
      monthlyScheduled: monthItems.length,
      pending: monthItems.filter((item) => isPendingStatus(item.status)).length,
      confirmed: monthItems.filter((item) => item.status === "confirmed").length
    }
  }, [visibleItems, visibleMonthDate])

  const itemsForToday = useMemo(() => {
    const start = startOfLocalDay(todayKey)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    return visibleItems.filter((item) => {
      const scheduledAt = getBoardDateValue(item)
      if (!scheduledAt) {
        return false
      }

      const date = new Date(scheduledAt)
      return date >= start && date < end
    })
  }, [visibleItems, todayKey])

  const itemsForSelectedDay = useMemo(() => {
    const start = startOfLocalDay(selectedDateKey)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    return visibleItems.filter((item) => {
      const scheduledAt = getBoardDateValue(item)
      if (!scheduledAt) {
        return false
      }

      const date = new Date(scheduledAt)
      return date >= start && date < end
    })
  }, [visibleItems, selectedDateKey])

  const selectedDateSummary = daySummaryMap.get(selectedDateKey)

  const goToToday = () => {
    setVisibleMonthDate(startOfMonth(today))
    setSelectedDateKey(todayKey)
  }

  const moveMonth = (offset: number) => {
    const nextMonth = startOfMonth(
      new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth() + offset, 1)
    )
    setVisibleMonthDate(nextMonth)
    setSelectedDateKey(toLocalYmd(nextMonth))
  }

  const handleSelectDate = (date: Date) => {
    const normalized = startOfMonth(date)
    setVisibleMonthDate(normalized)
    setSelectedDateKey(toLocalYmd(date))
  }

  return (
    <div className={styles.layout}>
      <section className={styles.main}>
        <section className={styles.todayCard} aria-label="오늘 일정 요약">
          <div className={styles.todayHeader}>
            <div className={styles.todayHeaderLeft}>
              <div className={styles.todayIcon} aria-hidden="true">
                +
              </div>
              <div>
                <p className={styles.todayKicker}>{formatMonthLabel(visibleMonthDate)}</p>
                <h2 className={styles.todayTitle}>이번 달 일정 요약</h2>
              </div>
            </div>
            <div className={styles.todayCount}>
              <span className={styles.todayCountValue}>{monthMetrics.monthlyScheduled}</span>
              <span className={styles.todayCountUnit}>건</span>
            </div>
          </div>

          <p className={styles.todayDescription}>
            월간 캘린더에서 확정된 체험수업과 검토 중인 신청 일정을 함께 확인해요.
          </p>

          <div className={styles.todayMetaRow}>
            <div className={styles.todayMetaItem}>
              <span className={styles.todayMetaLabel}>이번 달 체험수업</span>
              <span className={styles.todayMetaValue}>{monthMetrics.monthlyScheduled}</span>
            </div>
            <div className={styles.todayMetaItem}>
              <span className={styles.todayMetaLabel}>오늘 일정 수</span>
              <span className={styles.todayMetaValue}>{itemsForToday.length}</span>
            </div>
            <div className={styles.todayMetaItem}>
              <span className={styles.todayMetaLabel}>검토 중 신청 수</span>
              <span className={styles.todayMetaValue}>{monthMetrics.pending}</span>
            </div>
            <div className={styles.todayMetaItem}>
              <span className={styles.todayMetaLabel}>확정 일정</span>
              <span className={styles.todayMetaValue}>{monthMetrics.confirmed}</span>
            </div>
          </div>
        </section>

        <div className={styles.boardHeader}>
          <div>
            <h2 className={styles.boardTitle}>월간 체험수업 캘린더</h2>
            <p className={styles.boardDescription}>
              날짜별 일정 건수를 보고, 선택한 날짜의 상세 일정을 아래에서 확인해요.
            </p>
          </div>
          <div className={styles.boardHeaderRight}>
            <button type="button" className={styles.buttonGhost} onClick={goToToday}>
              오늘로 이동
            </button>
          </div>
        </div>

        <section className={styles.calendarCard} aria-label="월간 캘린더">
          <div className={styles.calendarHeader}>
            <div>
              <h3 className={styles.calendarTitle}>{formatMonthLabel(visibleMonthDate)}</h3>
              <p className={styles.calendarSubtitle}>확정, 검토 중, 완료 상태를 날짜별로 볼 수 있어요.</p>
            </div>
            <div className={styles.calendarNav}>
              <button type="button" className={styles.buttonGhost} onClick={() => moveMonth(-1)}>
                이전 달
              </button>
              <button type="button" className={styles.buttonGhost} onClick={() => moveMonth(1)}>
                다음 달
              </button>
            </div>
          </div>

          <div className={styles.weekdayRow} aria-hidden="true">
            {weekdayLabels.map((label) => (
              <span key={label} className={styles.weekdayCell}>
                {label}
              </span>
            ))}
          </div>

          <div className={styles.monthGrid}>
            {monthDays.map((day) => {
              const summary = daySummaryMap.get(day.key)
              const isSelected = day.key === selectedDateKey
              const isToday = day.key === todayKey

              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => handleSelectDate(day.date)}
                  className={[
                    styles.monthDay,
                    !day.isCurrentMonth ? styles.monthDayMuted : "",
                    isSelected ? styles.monthDaySelected : "",
                    isToday ? styles.monthDayToday : ""
                  ].join(" ")}
                >
                  <span className={styles.monthDayTop}>
                    <span className={styles.monthDayNumber}>{day.date.getDate()}</span>
                    {summary?.total ? <span className={styles.monthTotal}>{summary.total}건</span> : null}
                  </span>
                  <span className={styles.dayStats}>
                    {summary?.pendingCount ? (
                      <span className={`${styles.dayStat} ${styles.dayStatPending}`}>
                        검토 {summary.pendingCount}
                      </span>
                    ) : null}
                    {summary?.confirmedCount ? (
                      <span className={`${styles.dayStat} ${styles.dayStatConfirmed}`}>
                        확정 {summary.confirmedCount}
                      </span>
                    ) : null}
                    {summary?.completedCount ? (
                      <span className={`${styles.dayStat} ${styles.dayStatCompleted}`}>
                        완료 {summary.completedCount}
                      </span>
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className={styles.detailSection}>
          <div className={styles.detailHeader}>
            <div>
              <h3 className={styles.detailTitle}>{formatSelectedDateLabel(selectedDateKey)} 일정</h3>
              <p className={styles.boardDescription}>
                {selectedDateSummary?.total ?? 0}건의 신청/확정 일정을 시간순으로 보여줍니다.
              </p>
            </div>
            <div className={styles.detailCount}>표시 {itemsForSelectedDay.length}건</div>
          </div>

          {itemsForSelectedDay.length === 0 ? (
            <section className={styles.emptyCard} aria-label="빈 상태">
              <div className={styles.emptyIcon} aria-hidden="true">
                +
              </div>
              <p className={styles.emptyTitle}>선택한 날짜에 등록된 일정이 없어요.</p>
              <p className={styles.emptyDescription}>
                신청을 확정하면 이곳에서 일정을 확인할 수 있습니다.
              </p>
            </section>
          ) : (
            <div className={styles.timeline} aria-label="일정 목록">
              {itemsForSelectedDay.map((item) => {
                const scheduledAt = getBoardDateValue(item)
                if (!scheduledAt) {
                  return null
                }

                const statusBadge = getStatusBadge(item.status)
                const selectedLabel = getSecondaryScheduleLabel(item)
                const programLabel = item.classProgramType
                  ? PROGRAM_TYPE_LABELS[item.classProgramType]
                  : null
                const timeLabel = formatTime(scheduledAt)
                const timeMeta = item.confirmedSlotAt ? "확정 일정" : "희망 일정"
                const assignedTeacherLabel = getAssignedTeacherLabel(item)

                return (
                  <article key={item.id} className={styles.timelineItem}>
                    <div className={styles.timeCol}>
                      <div className={styles.timeText}>{timeLabel}</div>
                      <div className={styles.timeSub}>{timeMeta}</div>
                    </div>

                    <div className={styles.eventCard}>
                      <div className={styles.eventTop}>
                        <div className={styles.badgeRow}>
                          <Badge label={statusBadge.label} tone={statusBadge.tone} />
                          {programLabel ? <span className={styles.programPill}>{programLabel}</span> : null}
                        </div>
                      </div>

                      <div className={styles.eventBody}>
                        <strong className={styles.eventTitle}>{item.childName}</strong>
                        <p className={styles.eventSubtitle}>
                          {item.classTitle} · {item.childGrade}
                        </p>
                        {selectedLabel ? <p className={styles.eventNote}>{selectedLabel}</p> : null}

                        <div className={styles.metaGrid}>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>시간</span>
                            <span className={styles.metaValue}>{timeLabel}</span>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>상태</span>
                            <span className={styles.metaValue}>{statusBadge.label}</span>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>수업명</span>
                            <span className={styles.metaValue}>{item.classTitle}</span>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>보호자 연락처</span>
                            <span className={styles.metaValue}>{formatPhone(item.parentPhone)}</span>
                          </div>
                          <div className={styles.metaRow}>
                            <span className={styles.metaLabel}>담당 선생님</span>
                            <span className={styles.metaValue}>{assignedTeacherLabel}</span>
                          </div>
                        </div>
                      </div>

                      <div className={styles.eventFooter}>
                        <div className={styles.footerHint}>{item.parentName} 보호자 신청</div>
                        <Link
                          href={`/studio/applications/${item.id}`}
                          prefetch={false}
                          className={styles.linkButton}
                        >
                          신청 상세 보기
                        </Link>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </section>
    </div>
  )
}

const Badge = ({
  label,
  tone
}: {
  label: string
  tone:
    | "successSoft"
    | "warningSoft"
    | "infoSoft"
    | "neutralSoft"
    | "dangerSoft"
    | "darkSolid"
    | "successSolid"
}) => {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{label}</span>
}
