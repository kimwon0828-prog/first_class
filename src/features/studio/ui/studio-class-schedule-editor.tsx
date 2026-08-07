"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import { toDateKey } from "@/features/studio/lib/class-schedule-rule-utils"
import {
  applyOperatingDraftToScheduleSlots,
  buildOperatingImpactSummary,
  deriveOperatingDraftFromScheduleSlots,
  summarizeExistingWeeklySchedules,
  summarizeOperatingSlotsForEdit,
  type EditableStudioScheduleSlotDraft
} from "@/features/studio/lib/studio-operating-hours"
import type { StudioScheduleCalendarDay } from "@/shared/lib/db/adapter"

import { StudioOperatingHoursModal } from "./studio-operating-hours-modal"
import { StudioOperatingHoursSummary } from "./studio-operating-hours-summary"
import { StudioScheduleCalendar } from "./studio-schedule-calendar"
import { StudioScheduleDayPanel } from "./studio-schedule-day-panel"
import styles from "./studio-class-schedule-editor.module.css"

type StudioClassScheduleEditorProps = {
  classId: string
  month: string
  days: StudioScheduleCalendarDay[]
  scheduleSlots: EditableStudioScheduleSlotDraft[]
  onChangeScheduleSlots: (next: EditableStudioScheduleSlotDraft[]) => void
}

const parseMonth = (value: string) => {
  const parsed = new Date(`${value}-01T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

const toMonthValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

const getTodayKey = () => toDateKey(new Date())

const pickInitialSelectedDate = (days: StudioScheduleCalendarDay[], month: string) => {
  const todayKey = getTodayKey()
  if (days.some((day) => day.date === todayKey)) {
    return todayKey
  }

  const firstDay = days[0]?.date
  if (firstDay) {
    return firstDay
  }

  return `${month}-01`
}

export const StudioClassScheduleEditor = ({
  classId,
  month,
  days,
  scheduleSlots,
  onChangeScheduleSlots
}: StudioClassScheduleEditorProps) => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const visibleMonthDate = useMemo(() => parseMonth(month), [month])
  const dayMap = useMemo(() => new Map(days.map((day) => [day.date, day])), [days])
  const [selectedDate, setSelectedDate] = useState(() => pickInitialSelectedDate(days, month))
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isExceptionOpen, setIsExceptionOpen] = useState(false)
  const todayKey = toDateKey(new Date())

  useEffect(() => {
    setSelectedDate((current) => {
      if (dayMap.has(current)) {
        return current
      }

      return pickInitialSelectedDate(days, month)
    })
  }, [dayMap, days, month])

  const selectedDay = dayMap.get(selectedDate) ?? null
  const monthLabel = `${visibleMonthDate.getFullYear()}년 ${visibleMonthDate.getMonth() + 1}월`
  const summary = useMemo(() => summarizeOperatingSlotsForEdit(scheduleSlots, todayKey), [scheduleSlots, todayKey])
  const operatingDraft = useMemo(() => deriveOperatingDraftFromScheduleSlots(scheduleSlots, todayKey), [scheduleSlots, todayKey])
  const weeklySummaries = useMemo(() => summarizeExistingWeeklySchedules(scheduleSlots), [scheduleSlots])
  const impactSummary = useMemo(() => buildOperatingImpactSummary(scheduleSlots, todayKey), [scheduleSlots, todayKey])
  const protectedCount = useMemo(
    () =>
      days.reduce(
        (count, day) => count + day.items.filter((item) => item.scheduleType === "one_time" && item.activeReservationCount > 0).length,
        0
      ),
    [days]
  )

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth() + offset, 1)
    const params = new URLSearchParams(searchParams.toString())
    params.set("month", toMonthValue(next))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <section className={styles.editorLayout}>
      <StudioOperatingHoursSummary
        title="체험수업 예약시간"
        emptyDescription="기본 운영시간이 아직 정리되지 않았습니다."
        summary={summary}
        actionLabel={summary.hasValue ? "기본 운영시간 수정" : "기본 운영시간 설정"}
        onOpen={() => setIsModalOpen(true)}
      />

      <section className={styles.infoCard}>
        <strong className={styles.infoTitle}>기본 운영시간 변경 안내</strong>
        <p className={styles.infoText}>
          기본 운영시간을 변경하면 예약이 없는 미래 일정에 적용됩니다. 이미 신청자가 있는 일정은 변경되지 않습니다.
        </p>
        <div className={styles.infoBadges}>
          <span className={styles.noticeBadge}>변경 대상 {impactSummary.editableFutureCount}개</span>
          <span className={styles.noticeBadgeMuted}>보호 일정 {impactSummary.protectedFutureCount}개</span>
        </div>
      </section>

      {weeklySummaries.length > 0 ? (
        <section className={styles.infoCard}>
          <strong className={styles.infoTitle}>기존 반복 일정</strong>
          <p className={styles.infoText}>weekly 일정은 읽기 전용으로 유지되며 기본 운영시간 수정 모달에서 변경하지 않습니다.</p>
          <div className={styles.weeklyList}>
            {weeklySummaries.map((item) => (
              <article key={item.weekdayLabel} className={styles.weeklyCard}>
                <strong className={styles.weeklyTitle}>{item.weekdayLabel}</strong>
                {item.timeLabels.map((label) => (
                  <p key={`${item.weekdayLabel}-${label}`} className={styles.weeklyText}>
                    {label}
                  </p>
                ))}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={styles.exceptionCard}>
        <div className={styles.exceptionHeader}>
          <div>
            <h3 className={styles.exceptionTitle}>날짜별 예외 일정</h3>
            <p className={styles.exceptionDescription}>특정 날짜의 휴무, 마감, 추가 시간은 여기에서 관리할 수 있어요.</p>
          </div>
          <button
            type="button"
            className={styles.toggleButton}
            onClick={() => setIsExceptionOpen((current) => !current)}
          >
            {isExceptionOpen ? "예외 일정 접기" : "예외 일정 관리"}
          </button>
        </div>

        {isExceptionOpen ? (
          <>
            <p className={styles.calendarDraftHint}>
              아래 예외 일정 캘린더는 현재 저장된 일정 기준입니다. 기본 운영시간 변경 내용은 프로그램 수정 저장 후 반영됩니다.
            </p>
            <div className={styles.exceptionToolbar}>
              <button type="button" className={styles.iconButton} onClick={() => moveMonth(-1)}>
                이전 달
              </button>
              <button type="button" className={styles.iconButton} onClick={() => moveMonth(1)}>
                다음 달
              </button>
            </div>
            <div className={styles.calendarPanelGrid}>
              <div className={styles.calendarPane}>
                <div className={styles.calendarHeader}>
                  <div>
                    <h4 className={styles.calendarMonthLabel}>{monthLabel}</h4>
                    <p className={styles.calendarHint}>과거 날짜는 흐리게 표시되고 수정은 잠깁니다.</p>
                  </div>
                </div>
                <StudioScheduleCalendar
                  visibleMonthDate={visibleMonthDate}
                  selectedDate={selectedDate}
                  todayKey={todayKey}
                  dayMap={dayMap}
                  onSelectDate={setSelectedDate}
                />
              </div>
              <aside className={styles.panelPane}>
                <div className={styles.noticeRow}>
                  <span className={styles.noticeBadge}>weekly는 읽기 전용</span>
                  {protectedCount > 0 ? (
                    <span className={styles.noticeBadgeMuted}>예약자 있는 일정 {protectedCount}개 보호</span>
                  ) : null}
                </div>
                <StudioScheduleDayPanel
                  classId={classId}
                  selectedDate={selectedDate}
                  day={selectedDay}
                  classManagementHref={`${pathname}?month=${month}`}
                />
              </aside>
            </div>
          </>
        ) : null}
      </section>

      <StudioOperatingHoursModal
        isOpen={isModalOpen}
        title={summary.hasValue ? "기본 운영시간 수정하기" : "기본 운영시간 설정하기"}
        value={operatingDraft}
        onClose={() => setIsModalOpen(false)}
        onSave={(next) => {
          onChangeScheduleSlots(applyOperatingDraftToScheduleSlots(scheduleSlots, next, todayKey))
          setIsModalOpen(false)
        }}
      />
    </section>
  )
}
