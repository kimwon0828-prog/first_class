"use client"

import { formatDateHeadline } from "@/features/studio/lib/class-schedule-rule-utils"
import type { StudioScheduleCalendarDay } from "@/shared/lib/db/adapter"

import styles from "./studio-schedule-calendar.module.css"

const weekdayLabels = ["일", "월", "화", "수", "목", "금", "토"] as const

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

const toYmd = (date: Date) => {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const buildMonthDays = (baseDate: Date) => {
  const firstDay = startOfMonth(baseDate)
  const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0)
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - firstDay.getDay())
  const endDate = new Date(lastDay)
  endDate.setDate(lastDay.getDate() + (6 - lastDay.getDay()))

  const days: { key: string; date: Date; isCurrentMonth: boolean }[] = []
  const cursor = new Date(startDate)
  while (cursor <= endDate) {
    const date = new Date(cursor)
    days.push({
      key: toYmd(date),
      date,
      isCurrentMonth: date.getMonth() === baseDate.getMonth()
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

type StudioScheduleCalendarProps = {
  visibleMonthDate: Date
  selectedDate: string
  todayKey: string
  dayMap: Map<string, StudioScheduleCalendarDay>
  onSelectDate: (date: string) => void
}

export const StudioScheduleCalendar = ({
  visibleMonthDate,
  selectedDate,
  todayKey,
  dayMap,
  onSelectDate
}: StudioScheduleCalendarProps) => {
  const monthDays = buildMonthDays(visibleMonthDate)

  const getDayStatusText = (closedCount: number, hiddenCount: number, totalCount: number) => {
    if (totalCount === 0) {
      return ""
    }
    if (hiddenCount > 0) {
      return "예약 숨김"
    }

    return closedCount === totalCount ? "마감" : "운영 중"
  }

  const getDayStatusClassName = (closedCount: number, hiddenCount: number, totalCount: number) => {
    if (hiddenCount > 0) {
      return styles.dayStatusHidden
    }

    return closedCount === totalCount ? styles.dayStatusClosed : ""
  }

  return (
    <div className={styles.calendar}>
      <div className={styles.weekdayRow}>
        {weekdayLabels.map((label) => (
          <div key={label} className={styles.weekdayCell}>
            <div className={label === "일" ? styles.weekdayCellSunday : ""}>{label}</div>
          </div>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {monthDays.map((day) => {
          const summary = dayMap.get(day.key)
          const isSelected = selectedDate === day.key
          const isToday = todayKey === day.key
          const hasLockedItem = Boolean(summary?.items.some((item) => item.activeReservationCount > 0))
          const isPast = day.key < todayKey

          return (
            <button
              key={day.key}
              type="button"
              className={[
                styles.dayCell,
                !day.isCurrentMonth ? styles.dayCellMuted : "",
                isPast ? styles.dayCellPast : "",
                isToday ? styles.dayCellToday : "",
                isSelected ? styles.dayCellSelected : ""
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelectDate(day.key)}
            >
              <div className={styles.dayTop}>
                <span className={styles.dayNumber}>{day.date.getDate()}</span>
                {summary ? <span className={styles.countBadge}>{summary.items.length}개</span> : null}
              </div>
              {summary ? (
                <div className={styles.dayBody}>
                  <span className={styles.dayMetric}>{summary.items.length}타임</span>
                  <span className={styles.dayMetric}>신청 {summary.totalActiveReservationCount}</span>
                  {hasLockedItem ? <span className={styles.lockBadge}>🔒</span> : null}
                  {getDayStatusText(summary.closedCount, summary.hiddenCount, summary.items.length) ? (
                    <span
                      className={[
                        styles.dayStatus,
                        getDayStatusClassName(summary.closedCount, summary.hiddenCount, summary.items.length)
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      title={formatDateHeadline(day.key)}
                    >
                      {getDayStatusText(summary.closedCount, summary.hiddenCount, summary.items.length)}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
