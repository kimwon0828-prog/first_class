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

/**
 * 월 달력 (Figma "특정 날짜만 변경하기" 2178:970).
 *
 * 칸 하나 38px. 예약 시간이 있는 날은 굵게 + 점(운영일 초록, 마감 · 숨김이 있는 날 주황),
 * 선택한 날은 진한 초록. 이번 달이 아닌 칸은 비워 둔다. 날짜별 자세한 수치(타임 수 · 신청 수 ·
 * 마감 상태)는 화면에서 줄이는 대신 버튼 이름(aria-label)과 title 에 그대로 담는다.
 */
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

  return (
    <div className={styles.calendar}>
      <div className={styles.weekdayRow} aria-hidden="true">
        {weekdayLabels.map((label) => (
          <div key={label} className={styles.weekdayCell}>
            {label}
          </div>
        ))}
      </div>
      <div className={styles.monthGrid}>
        {monthDays.map((day) => {
          if (!day.isCurrentMonth) {
            return <div key={day.key} className={styles.dayCellEmpty} aria-hidden="true" />
          }

          const summary = dayMap.get(day.key)
          const itemCount = summary?.items.length ?? 0
          const isSelected = selectedDate === day.key
          const isToday = todayKey === day.key
          const hasLockedItem = Boolean(summary?.items.some((item) => item.activeReservationCount > 0))
          const isPast = day.key < todayKey
          const isChanged = Boolean(summary && (summary.closedCount > 0 || summary.hiddenCount > 0))
          const statusText = summary ? getDayStatusText(summary.closedCount, summary.hiddenCount, itemCount) : ""
          const label = [
            formatDateHeadline(day.key),
            isToday ? "오늘" : "",
            summary && itemCount > 0 ? `${itemCount}타임 · 신청 ${summary.totalActiveReservationCount}건` : "예약 시간 없음",
            statusText,
            hasLockedItem ? "예약 있음" : ""
          ].filter(Boolean).join(", ")

          return (
            <button
              key={day.key}
              type="button"
              className={[
                styles.dayCell,
                itemCount > 0 ? styles.dayCellHasItems : "",
                isPast ? styles.dayCellPast : "",
                isSelected ? styles.dayCellSelected : ""
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={label}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              title={label}
              onClick={() => onSelectDate(day.key)}
            >
              <span className={styles.dayNumber}>{day.date.getDate()}</span>
              {itemCount > 0 ? (
                <span className={`${styles.dayDot} ${isChanged ? styles.dayDotChanged : ""}`} aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
