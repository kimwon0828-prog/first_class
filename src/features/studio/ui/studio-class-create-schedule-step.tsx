"use client"

import { useEffect, useMemo, useState } from "react"

import {
  buildCreateClassScheduleDraftSlots,
  createDefaultCreateClassScheduleDraft,
  type CreateClassScheduleDraft,
  type CreateClassScheduleDraftSlot,
  summarizeCreateScheduleDraft,
} from "@/features/studio/lib/studio-operating-hours"
import {
  formatDateHeadline,
  formatKoreanMeridiemTime,
  parseMonth,
  toMonthValue
} from "@/features/studio/lib/class-schedule-rule-utils"
import type { StudioScheduleCalendarDay, StudioScheduleCalendarItem } from "@/shared/lib/db/adapter"

import { StudioOperatingHoursModal } from "./studio-operating-hours-modal"
import { StudioOperatingHoursSummary } from "./studio-operating-hours-summary"
import { StudioScheduleCalendar } from "./studio-schedule-calendar"
import styles from "./studio-class-create-schedule-step.module.css"

type StudioClassCreateScheduleStepProps = {
  scheduleDraft: CreateClassScheduleDraft
  slotsError?: string
  onChange: (next: CreateClassScheduleDraft) => void
}

const buildDraftCalendarDays = (generatedSlots: CreateClassScheduleDraftSlot[]): StudioScheduleCalendarDay[] => {
  const dayMap = new Map<string, StudioScheduleCalendarItem[]>()

  for (const slot of generatedSlots) {
    const current = dayMap.get(slot.specificDate) ?? []
    current.push({
      classScheduleId: slot.id,
      classId: "draft",
      classTitle: "생성 예정 일정",
      teacherId: null,
      teacherName: null,
      scheduleType: "one_time",
      bookingStatus: slot.bookingStatus,
      dayOfWeek: null,
      specificDate: slot.specificDate,
      startTime: slot.startTime,
      endTime: slot.endTime,
      capacity: slot.capacity,
      activeReservationCount: 0,
      remainingCapacity: slot.capacity,
      status: slot.bookingStatus === "closed" ? "closed" : "open",
      seriesId: slot.seriesId
    })
    dayMap.set(slot.specificDate, current)
  }

  return Array.from(dayMap.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([date, items]) => ({
      date,
      items: items.sort((left, right) => left.startTime.localeCompare(right.startTime)),
      totalCapacity: items.reduce((sum, item) => sum + item.capacity, 0),
      totalActiveReservationCount: 0,
      totalRemainingCapacity: items.reduce((sum, item) => sum + item.remainingCapacity, 0),
      closedCount: items.filter((item) => item.bookingStatus === "closed").length,
      hiddenCount: 0
    }))
}

export const StudioClassCreateScheduleStep = ({
  scheduleDraft,
  slotsError,
  onChange
}: StudioClassCreateScheduleStepProps) => {
  const generatedSlots = useMemo(() => buildCreateClassScheduleDraftSlots(scheduleDraft), [scheduleDraft])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const summary = useMemo(() => summarizeCreateScheduleDraft(scheduleDraft), [scheduleDraft])
  const calendarDays = useMemo(() => buildDraftCalendarDays(generatedSlots), [generatedSlots])
  const generatedWeekdayCount = useMemo(
    () => new Set(scheduleDraft.groups.flatMap((group) => group.weekdays)).size,
    [scheduleDraft.groups]
  )
  const firstGeneratedDate = generatedSlots[0]?.specificDate ?? ""
  const initialMonth = useMemo(
    () =>
      (firstGeneratedDate || scheduleDraft.operationStartDate || toMonthValue(new Date())).slice(0, 7),
    [firstGeneratedDate, scheduleDraft.operationStartDate]
  )
  const [visibleMonth, setVisibleMonth] = useState(initialMonth)
  const [selectedDate, setSelectedDate] = useState(firstGeneratedDate || `${initialMonth}-01`)
  const visibleMonthDate = useMemo(() => parseMonth(visibleMonth), [visibleMonth])
  const dayMap = useMemo(() => new Map(calendarDays.map((day) => [day.date, day])), [calendarDays])
  const selectedDay = dayMap.get(selectedDate) ?? null

  useEffect(() => {
    setVisibleMonth(initialMonth)
    setSelectedDate(firstGeneratedDate || `${initialMonth}-01`)
  }, [firstGeneratedDate, initialMonth])

  useEffect(() => {
    if (dayMap.has(selectedDate)) {
      return
    }

    const fallbackDate = calendarDays[0]?.date ?? `${visibleMonth}-01`
    setSelectedDate(fallbackDate)
  }, [calendarDays, dayMap, selectedDate, visibleMonth])

  const moveMonth = (offset: number) => {
    const next = new Date(visibleMonthDate.getFullYear(), visibleMonthDate.getMonth() + offset, 1)
    setVisibleMonth(toMonthValue(next))
  }

  return (
    <div className={styles.scheduleStepLayout}>
      <section className={styles.sectionBlock}>
        <p className={styles.sectionLabel}>기본 운영시간</p>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.noteBlock}>
              <strong className={styles.noteTitle}>기본 운영시간</strong>
              <p className={styles.noteText}>학부모가 예약할 수 있는 날짜와 시간을 설정해 주세요.</p>
            </div>
          </div>
          <StudioOperatingHoursSummary
            title="반복되는 예약 가능 시간"
            emptyDescription="아직 기본 운영시간이 설정되지 않았어요."
            summary={summary}
            actionLabel="설정하기"
            onOpen={() => setIsModalOpen(true)}
          />
          <p className={styles.subtleText}>설정한 규칙을 기준으로 실제 예약 가능한 시간이 자동으로 생성돼요.</p>
        </section>
      </section>

      <section className={styles.sectionBlock}>
        <p className={styles.sectionLabel}>생성될 예약 일정</p>
        <section className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <div className={styles.noteBlock}>
              <strong className={styles.noteTitle}>생성될 예약 일정 미리보기</strong>
              <p className={styles.noteText}>
                {summary.hasValue ? summary.periodLabel : "기본 운영시간을 설정하면 생성될 일정이 여기에 표시됩니다."}
              </p>
            </div>
            {generatedSlots.length > 0 ? (
              <div className={styles.metricRow}>
                <span className={styles.metricChip}>총 {generatedSlots.length}개</span>
                {generatedWeekdayCount > 0 ? (
                  <span className={styles.metricChipMuted}>주 {generatedWeekdayCount}일</span>
                ) : null}
                <span className={styles.metricChipMuted}>{scheduleDraft.intervalMinutes}분 간격</span>
              </div>
            ) : null}
          </div>

          {generatedSlots.length > 0 ? (
            <div className={styles.previewLayout}>
              <div className={styles.previewCalendarCard}>
                <div className={styles.previewToolbar}>
                  <button type="button" className={styles.iconButton} onClick={() => moveMonth(-1)}>
                    이전 달
                  </button>
                  <h4 className={styles.previewMonthLabel}>
                    {visibleMonthDate.getFullYear()}년 {visibleMonthDate.getMonth() + 1}월
                  </h4>
                  <button type="button" className={styles.iconButton} onClick={() => moveMonth(1)}>
                    다음 달
                  </button>
                </div>
                <StudioScheduleCalendar
                  visibleMonthDate={visibleMonthDate}
                  selectedDate={selectedDate}
                  todayKey={firstGeneratedDate || selectedDate}
                  dayMap={dayMap}
                  onSelectDate={setSelectedDate}
                />
              </div>

              <aside className={styles.previewDayCard}>
                <div className={styles.noteBlock}>
                  <strong className={styles.noteTitle}>
                    {selectedDay ? formatDateHeadline(selectedDate) : "날짜를 선택해 주세요"}
                  </strong>
                  <p className={styles.noteText}>
                    {selectedDay
                      ? `이 날짜에 생성될 예약 시간 ${selectedDay.items.length}개`
                      : "캘린더에서 날짜를 선택하면 생성될 예약 시간을 볼 수 있어요."}
                  </p>
                </div>

                {selectedDay ? (
                  <div className={styles.generatedSlotList}>
                    {selectedDay.items.map((item) => (
                      <article key={item.classScheduleId} className={styles.generatedSlotCard}>
                        <div className={styles.generatedSlotHeader}>
                          <strong className={styles.generatedSlotTime}>
                            {formatKoreanMeridiemTime(item.startTime)} ~ {formatKoreanMeridiemTime(item.endTime)}
                          </strong>
                          <span
                            className={`${styles.metricChipMuted} ${
                              item.bookingStatus === "closed" ? styles.metricChipWarning : ""
                            }`}
                          >
                            {item.bookingStatus === "closed" ? "마감 예정" : "예약 가능"}
                          </span>
                        </div>
                        <p className={styles.generatedSlotMeta}>타임당 정원 {item.capacity}명</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyText}>생성될 일정이 아직 없습니다.</p>
                )}
              </aside>
            </div>
          ) : (
            <div className={styles.emptyCard}>
              <strong className={styles.noteTitle}>생성될 일정이 아직 없어요.</strong>
              <p className={styles.noteText}>기본 운영시간을 설정하면 실제 생성될 예약 일정을 캘린더에서 확인할 수 있어요.</p>
            </div>
          )}

          <p className={styles.subtleText}>저장 전에는 DB에 반영되지 않아요.</p>
        </section>
      </section>

      <section className={styles.sectionBlock}>
        <p className={styles.sectionLabel}>날짜별 예외</p>
        <section className={styles.sectionCard}>
          <div className={styles.noteBlock}>
            <strong className={styles.noteTitle}>날짜별 예외 일정</strong>
            <p className={styles.noteText}>
              신규 등록 단계에서는 아직 날짜별 휴무, 추가 운영, 특정 시간 마감, 정원 변경을 직접 편집하지 않습니다.
            </p>
            <p className={styles.subtleText}>
              프로그램을 등록한 뒤 수업 관리 화면에서 날짜별 예외 일정을 추가하고 수정할 수 있어요.
            </p>
          </div>
        </section>
      </section>

      {slotsError ? <p className={styles.errorText}>{slotsError}</p> : null}

      <StudioOperatingHoursModal
        isOpen={isModalOpen}
        title={summary.hasValue ? "기본 운영시간 수정하기" : "기본 운영시간 설정하기"}
        value={scheduleDraft ?? createDefaultCreateClassScheduleDraft()}
        onClose={() => setIsModalOpen(false)}
        onSave={(next) => {
          onChange(next)
          setIsModalOpen(false)
        }}
      />
    </div>
  )
}

export type { CreateClassScheduleDraft, CreateClassScheduleDraftSlot }
export { buildCreateClassScheduleDraftSlots, createDefaultCreateClassScheduleDraft }
