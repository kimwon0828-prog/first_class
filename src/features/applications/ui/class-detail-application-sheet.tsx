"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"

import { isChildEligibleForClass } from "@/shared/constants/grade-options"
import { CHILD_GRADES, getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import { useTrialApplicationForm, type TrialApplicationFormProps } from "./use-trial-application-form"
import styles from "./class-detail-application-sheet.module.css"

type ClassDetailApplicationSheetProps = TrialApplicationFormProps & {
  classTitle: string
  academyName: string | null
  teacherName: string | null
  trialPriceLabel: string
  hasSession: boolean
  isParentUser: boolean
  signInHref: string
  fixedCtaClassName: string
  ctaButtonClassName: string
}

type Step = 1 | 2 | 3

type GroupedDateSlots = {
  dateKey: string
  date: Date
  slots: AvailableScheduleSlot[]
  hasSelectableSlot: boolean
  hasClosedOnlySlot: boolean
}

const WEEKDAY_SHORT_LABELS = ["일", "월", "화", "수", "목", "금", "토"]
const HIDDEN_BOOKING_STATUS = "hidden"

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`

const formatFullDateLabel = (date: Date) =>
  `${date.getMonth() + 1}월 ${date.getDate()}일 ${WEEKDAY_SHORT_LABELS[date.getDay()]}요일`

const formatSummaryDateTime = (date: Date) =>
  `${date.getMonth() + 1}월 ${date.getDate()}일(${WEEKDAY_SHORT_LABELS[date.getDay()]}) ${new Intl.DateTimeFormat(
    "ko-KR",
    {
      hour: "numeric",
      minute: "2-digit",
      hour12: true
    }
  ).format(date)}`

const formatTimeChipLabel = (startAt: string) => {
  const date = new Date(startAt)

  if (Number.isNaN(date.getTime())) {
    return startAt
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date)
}

const resolveMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`

const getMonthStart = (monthKey: string) => {
  const [year, month] = monthKey.split("-").map(Number)
  return new Date(year, month - 1, 1)
}

const buildMonthGrid = (monthKey: string) => {
  const monthStart = getMonthStart(monthKey)
  const gridStart = new Date(monthStart)
  gridStart.setDate(1 - monthStart.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setDate(gridStart.getDate() + index)
    return date
  })
}

const getDateMonthValue = (dateKey: string) => dateKey.slice(0, 7)

const isHiddenSlot = (slot: AvailableScheduleSlot) => slot.bookingStatus === HIDDEN_BOOKING_STATUS

const isPastSlot = (slot: AvailableScheduleSlot) => {
  const time = new Date(slot.startAt).getTime()
  return Number.isNaN(time) || time <= Date.now()
}

const isSelectableSlot = (slot: AvailableScheduleSlot) =>
  !isHiddenSlot(slot) && !slot.isClosed && slot.remainingCount > 0 && !isPastSlot(slot)

const buildGroupedDateSlots = (availableSlots: AvailableScheduleSlot[]) => {
  const grouped = new Map<string, GroupedDateSlots>()

  availableSlots
    .filter((slot) => !isHiddenSlot(slot))
    .sort((left, right) => left.startAt.localeCompare(right.startAt))
    .forEach((slot) => {
      const date = new Date(slot.startAt)

      if (Number.isNaN(date.getTime())) {
        return
      }

      const dateKey = toDateKey(date)
      const existing = grouped.get(dateKey)

      if (!existing) {
        grouped.set(dateKey, {
          dateKey,
          date,
          slots: [slot],
          hasSelectableSlot: isSelectableSlot(slot),
          hasClosedOnlySlot: !isSelectableSlot(slot)
        })
        return
      }

      existing.slots.push(slot)
      existing.hasSelectableSlot = existing.hasSelectableSlot || isSelectableSlot(slot)
      existing.hasClosedOnlySlot = !existing.hasSelectableSlot && existing.slots.some((item) => !isHiddenSlot(item))
    })

  return Array.from(grouped.values()).sort((left, right) => left.date.getTime() - right.date.getTime())
}

const resolveInitialDateKey = (groupedDateSlots: GroupedDateSlots[]) =>
  groupedDateSlots.find((group) => group.hasSelectableSlot)?.dateKey ?? null

const normalizeTeacherLabel = (teacherName: string | null) => {
  const trimmed = teacherName?.trim() || ""

  if (!trimmed) {
    return "담당 선생님 정보 확인 후 안내"
  }

  return trimmed.endsWith("선생님") ? trimmed : `${trimmed} 선생님`
}

export function ClassDetailApplicationSheet({
  classId,
  classTitle,
  classTargetAge,
  availableSlots,
  slotsError,
  childProfiles,
  childProfilesError,
  parentName,
  parentPhone,
  academyName,
  teacherName,
  trialPriceLabel,
  hasSession,
  isParentUser,
  signInHref,
  fixedCtaClassName,
  ctaButtonClassName
}: ClassDetailApplicationSheetProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [isCalendarView, setIsCalendarView] = useState(false)
  const groupedDateSlots = useMemo(() => buildGroupedDateSlots(availableSlots), [availableSlots])
  const initialDateKey = useMemo(() => resolveInitialDateKey(groupedDateSlots), [groupedDateSlots])
  const monthKeys = useMemo(
    () => Array.from(new Set(groupedDateSlots.map((group) => resolveMonthKey(group.date)))),
    [groupedDateSlots]
  )
  const {
    state,
    formAction,
    isPending,
    selectedChildId,
    setSelectedChildId,
    selectedOptionId,
    setSelectedOptionId,
    childName,
    setChildName,
    childGrade,
    setChildGrade,
    childSchool,
    setChildSchool,
    childNotes,
    setChildNotes,
    subjectExperienceYn,
    setSubjectExperienceYn,
    subjectExperienceDuration,
    setSubjectExperienceDuration,
    currentLevel,
    setCurrentLevel,
    preferredRegularSchedule,
    setPreferredRegularSchedule,
    goalType,
    setGoalType,
    goalNote,
    setGoalNote,
    memo,
    setMemo,
    privacyAgreed,
    setPrivacyAgreed,
    thirdPartyAgreed,
    setThirdPartyAgreed,
    guardianAgreed,
    setGuardianAgreed,
    clientMessage,
    selectedSlot,
    classTargetGradeLabel,
    isGradeEligible,
    legacyChildGradeValue,
    canSubmit,
    requiredAgreementsChecked,
    handleSubmit
  } = useTrialApplicationForm(
    {
      classId,
      classTargetAge,
      availableSlots,
      slotsError,
      childProfiles
    },
    { autoSelectSingleSlot: false }
  )
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(initialDateKey)
  const selectedDateGroup = useMemo(
    () => groupedDateSlots.find((group) => group.dateKey === selectedDateKey) ?? null,
    [groupedDateSlots, selectedDateKey]
  )
  const selectedDateSlots = selectedDateGroup?.slots ?? []
  const monthKeyFromSelectedDate = selectedDateKey ? getDateMonthValue(selectedDateKey) : null
  const [currentMonthKey, setCurrentMonthKey] = useState<string | null>(monthKeyFromSelectedDate ?? monthKeys[0] ?? null)
  const selectedSlotDateKey = useMemo(() => {
    if (!selectedSlot) {
      return null
    }

    const date = new Date(selectedSlot.startAt)
    return Number.isNaN(date.getTime()) ? null : toDateKey(date)
  }, [selectedSlot])
  const selectedScheduleSummary = useMemo(() => {
    if (!selectedSlot) {
      return null
    }

    const startDate = new Date(selectedSlot.startAt)
    return Number.isNaN(startDate.getTime()) ? null : formatSummaryDateTime(startDate)
  }, [selectedSlot])
  const canProceedStep1 = Boolean(selectedSlot && isSelectableSlot(selectedSlot))
  const canProceedStep2 =
    hasSession &&
    isParentUser &&
    childName.trim().length >= 2 &&
    childGrade.trim().length > 0 &&
    isGradeEligible
  const canFinalSubmit = hasSession && isParentUser && canSubmit && requiredAgreementsChecked
  const teacherLabel = normalizeTeacherLabel(teacherName)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false)
        setIsCalendarView(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.body.style.overflow = overflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!selectedDateKey) {
      setSelectedDateKey(initialDateKey)
      return
    }

    if (!groupedDateSlots.some((group) => group.dateKey === selectedDateKey)) {
      setSelectedDateKey(initialDateKey)
    }
  }, [groupedDateSlots, initialDateKey, selectedDateKey])

  useEffect(() => {
    if (selectedSlotDateKey) {
      setSelectedDateKey(selectedSlotDateKey)
      setCurrentMonthKey(getDateMonthValue(selectedSlotDateKey))
      return
    }

    if (!currentMonthKey && monthKeys[0]) {
      setCurrentMonthKey(monthKeys[0])
    }
  }, [currentMonthKey, monthKeys, selectedSlotDateKey])

  const openSheet = () => {
    setIsOpen(true)
    setStep(1)
    setIsCalendarView(false)

    if (selectedSlotDateKey) {
      setSelectedDateKey(selectedSlotDateKey)
      setCurrentMonthKey(getDateMonthValue(selectedSlotDateKey))
      return
    }

    setSelectedDateKey((current) => current ?? initialDateKey)
    setCurrentMonthKey((current) => current ?? monthKeyFromSelectedDate ?? monthKeys[0] ?? null)
  }

  const closeSheet = () => {
    setIsOpen(false)
    setIsCalendarView(false)
  }

  const handleSelectDate = (dateKey: string) => {
    setSelectedDateKey(dateKey)
    const slotMatchesDate = selectedSlotDateKey === dateKey

    if (!slotMatchesDate) {
      setSelectedOptionId("")
    }
  }

  const currentMonthIndex = currentMonthKey ? monthKeys.indexOf(currentMonthKey) : -1
  const calendarDates = currentMonthKey ? buildMonthGrid(currentMonthKey) : []

  return (
    <>
      <div className={fixedCtaClassName}>
        <button type="button" className={ctaButtonClassName} onClick={openSheet}>
          체험 신청하기
        </button>
      </div>

      {isOpen ? (
        <div className={styles.overlay} onClick={closeSheet} aria-hidden="true">
          <div
            className={styles.sheet}
            role="dialog"
            aria-modal="true"
            aria-label="체험수업 신청"
            onClick={(event) => event.stopPropagation()}
          >
            <form action={formAction} onSubmit={handleSubmit} className={styles.sheetLayout}>
              <div className={styles.sheetHeader}>
                <div className={styles.sheetHandle} />
                <div className={styles.headerRow}>
                  <h2 className={styles.sheetTitle}>체험수업 신청</h2>
                  <button type="button" className={styles.closeButton} onClick={closeSheet} aria-label="닫기">
                    ×
                  </button>
                </div>
                <div className={styles.progressTrack} aria-hidden="true">
                  <div className={styles.progressValue} style={{ width: `${(step / 3) * 100}%` }} />
                </div>
              </div>

              <div className={styles.sheetBody}>
                {step === 1 ? (
                  <>
                    {!isCalendarView ? (
                      <section className={styles.sectionStack}>
                        <div className={styles.headingBlock}>
                          <p className={styles.stepEyebrow}>일정 선택</p>
                          <h3 className={styles.stepTitle}>예약 가능한 날짜와 시간을 선택해주세요.</h3>
                        </div>

                        {slotsError ? <p className={styles.errorText}>{slotsError}</p> : null}

                        {!slotsError && groupedDateSlots.length === 0 ? (
                          <div className={styles.emptyState}>
                            <p className={styles.emptyTitle}>예약 가능한 일정이 없어요</p>
                            <p className={styles.emptyText}>
                              현재 신청 가능한 체험수업 일정이 없습니다. 학원에서 새로운 일정을 등록하면 예약할 수
                              있어요.
                            </p>
                          </div>
                        ) : null}

                        {!slotsError && groupedDateSlots.length > 0 ? (
                          <>
                            <button
                              type="button"
                              className={styles.dateButton}
                              onClick={() => setIsCalendarView(true)}
                              aria-label="날짜 선택"
                            >
                              <span className={styles.dateButtonLabel}>
                                {selectedDateGroup ? formatFullDateLabel(selectedDateGroup.date) : "예약 가능한 날짜 찾기"}
                              </span>
                              <span className={styles.chevron} aria-hidden="true" />
                            </button>

                            <div className={styles.timeSection}>
                              <div className={styles.timeSectionHeader}>
                                <span className={styles.timeSectionTitle}>가능한 시간</span>
                                <button type="button" className={styles.inlineTextButton} onClick={() => setIsCalendarView(true)}>
                                  다른 날짜 보기
                                </button>
                              </div>

                              <div className={styles.timeGrid}>
                                {selectedDateSlots.map((slot) => {
                                  const disabled = !isSelectableSlot(slot)

                                  return (
                                    <button
                                      key={slot.id}
                                      type="button"
                                      className={`${styles.timeChip} ${
                                        selectedOptionId === slot.optionId ? styles.timeChipSelected : ""
                                      } ${disabled ? styles.timeChipDisabled : ""}`}
                                      onClick={() => {
                                        if (disabled) {
                                          return
                                        }

                                        setSelectedOptionId(slot.optionId)
                                      }}
                                      disabled={disabled}
                                      aria-pressed={selectedOptionId === slot.optionId}
                                    >
                                      {disabled ? "마감" : formatTimeChipLabel(slot.startAt)}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </>
                        ) : null}
                      </section>
                    ) : (
                      <section className={styles.sectionStack}>
                        <div className={styles.calendarHeader}>
                          <button
                            type="button"
                            className={styles.monthNavButton}
                            onClick={() => {
                              if (currentMonthIndex > 0) {
                                setCurrentMonthKey(monthKeys[currentMonthIndex - 1])
                              }
                            }}
                            disabled={currentMonthIndex <= 0}
                            aria-label="이전 달"
                          >
                            ‹
                          </button>
                          <strong className={styles.monthLabel}>
                            {currentMonthKey ? `${getMonthStart(currentMonthKey).getFullYear()}년 ${getMonthStart(currentMonthKey).getMonth() + 1}월` : ""}
                          </strong>
                          <button
                            type="button"
                            className={styles.monthNavButton}
                            onClick={() => {
                              if (currentMonthIndex >= 0 && currentMonthIndex < monthKeys.length - 1) {
                                setCurrentMonthKey(monthKeys[currentMonthIndex + 1])
                              }
                            }}
                            disabled={currentMonthIndex < 0 || currentMonthIndex >= monthKeys.length - 1}
                            aria-label="다음 달"
                          >
                            ›
                          </button>
                        </div>

                        <div className={styles.weekdayRow}>
                          {WEEKDAY_SHORT_LABELS.map((weekday) => (
                            <span key={weekday} className={styles.weekdayLabel}>
                              {weekday}
                            </span>
                          ))}
                        </div>

                        <div className={styles.calendarGrid}>
                          {calendarDates.map((date) => {
                            const dateKey = toDateKey(date)
                            const group = groupedDateSlots.find((item) => item.dateKey === dateKey) ?? null
                            const isCurrentMonth = resolveMonthKey(date) === currentMonthKey
                            const isSelected = selectedDateKey === dateKey
                            const isPast = date.setHours(23, 59, 59, 999) < Date.now()
                            const isDisabled = !group || isPast

                            return (
                              <button
                                key={dateKey}
                                type="button"
                                className={`${styles.calendarCell} ${
                                  !isCurrentMonth ? styles.calendarCellMuted : ""
                                } ${isSelected ? styles.calendarCellSelected : ""} ${
                                  group?.hasSelectableSlot ? styles.calendarCellAvailable : ""
                                } ${group && !group.hasSelectableSlot ? styles.calendarCellClosed : ""}`}
                                disabled={isDisabled}
                                onClick={() => handleSelectDate(dateKey)}
                                aria-pressed={isSelected}
                              >
                                <span>{date.getDate()}</span>
                                {group?.hasSelectableSlot ? <span className={styles.calendarDot} aria-hidden="true" /> : null}
                              </button>
                            )
                          })}
                        </div>

                        <div className={styles.calendarSelectionPanel}>
                          <p className={styles.calendarSelectionTitle}>
                            {selectedDateGroup ? formatFullDateLabel(selectedDateGroup.date) : "날짜를 선택해주세요"}
                          </p>
                          <div className={styles.timeGrid}>
                            {selectedDateSlots.map((slot) => {
                              const disabled = !isSelectableSlot(slot)

                              return (
                                <button
                                  key={`${slot.id}-calendar`}
                                  type="button"
                                  className={`${styles.timeChip} ${
                                    selectedOptionId === slot.optionId ? styles.timeChipSelected : ""
                                  } ${disabled ? styles.timeChipDisabled : ""}`}
                                  onClick={() => {
                                    if (disabled) {
                                      return
                                    }

                                    setSelectedOptionId(slot.optionId)
                                  }}
                                  disabled={disabled}
                                  aria-pressed={selectedOptionId === slot.optionId}
                                >
                                  {disabled ? "마감" : formatTimeChipLabel(slot.startAt)}
                                </button>
                              )
                            })}
                          </div>
                          <button type="button" className={styles.completeButton} onClick={() => setIsCalendarView(false)}>
                            선택 완료
                          </button>
                        </div>
                      </section>
                    )}
                  </>
                ) : null}

                {step === 2 ? (
                  <section className={styles.sectionStack}>
                    <div className={styles.headingBlock}>
                      <p className={styles.stepEyebrow}>참여할 자녀 선택</p>
                      <h3 className={styles.stepTitle}>수업에 참여할 자녀 정보를 확인해주세요.</h3>
                    </div>

                    {!hasSession ? (
                      <div className={styles.loginCard}>
                        <p className={styles.loginTitle}>로그인 후 자녀 정보를 선택할 수 있어요.</p>
                        <p className={styles.loginText}>
                          STEP 1에서 고른 일정은 유지되고, 로그인 후 다시 상세페이지에서 이어서 신청할 수 있어요.
                        </p>
                        <Link href={signInHref} className={styles.loginButton}>
                          로그인하기
                        </Link>
                      </div>
                    ) : !isParentUser ? (
                      <div className={styles.loginCard}>
                        <p className={styles.loginTitle}>학부모 계정으로 신청할 수 있어요.</p>
                        <p className={styles.loginText}>학부모 계정으로 로그인한 뒤 자녀 정보를 선택해주세요.</p>
                      </div>
                    ) : (
                      <>
                        <div className={styles.summaryCard}>
                          <div className={styles.summaryRow}>
                            <span className={styles.summaryLabel}>보호자명</span>
                            <span className={styles.summaryValue}>{parentName}</span>
                          </div>
                          <div className={styles.summaryRow}>
                            <span className={styles.summaryLabel}>연락처</span>
                            <span className={styles.summaryValue}>{parentPhone ?? "등록된 연락처가 없습니다."}</span>
                          </div>
                        </div>

                        {childProfilesError ? <p className={styles.errorText}>{childProfilesError}</p> : null}

                        {childProfiles.length > 0 ? (
                          <div className={styles.childCardList}>
                            {childProfiles.map((child) => {
                              const disabled = !isChildEligibleForClass(child.grade, classTargetAge)

                              return (
                                <button
                                  key={child.id}
                                  type="button"
                                  className={`${styles.childCard} ${
                                    selectedChildId === child.id ? styles.childCardSelected : ""
                                  }`}
                                  onClick={() => setSelectedChildId(child.id)}
                                  aria-pressed={selectedChildId === child.id}
                                  disabled={disabled}
                                >
                                  <strong className={styles.childName}>{child.name}</strong>
                                  <span className={styles.childMeta}>{getChildGradeLabel(child.grade) ?? child.grade}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}

                        <button type="button" className={styles.inlineAddButton} onClick={() => setSelectedChildId("")}>
                          + 새로운 자녀 정보 입력
                        </button>

                        <div className={styles.fieldStack}>
                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>학생 이름</span>
                            <input
                              type="text"
                              value={childName}
                              onChange={(event) => setChildName(event.target.value)}
                              disabled={isPending}
                              className={styles.input}
                            />
                          </label>

                          <label className={styles.field}>
                            <span className={styles.fieldLabel}>학년</span>
                            <select
                              value={childGrade}
                              onChange={(event) => setChildGrade(event.target.value)}
                              disabled={isPending}
                              className={styles.input}
                            >
                              <option value="" disabled>
                                학년을 선택해주세요
                              </option>
                              {legacyChildGradeValue ? (
                                <option value={legacyChildGradeValue}>
                                  {getChildGradeLabel(legacyChildGradeValue) ?? legacyChildGradeValue} (기존 값)
                                </option>
                              ) : null}
                              {CHILD_GRADES.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className={styles.fieldHelp}>대상 학년: {classTargetGradeLabel}</span>
                            {!isGradeEligible && childGrade.trim() ? (
                              <span className={styles.errorText}>
                                선택한 자녀의 학년이 이 수업의 대상 학년과 맞지 않아 신청할 수 없어요.
                              </span>
                            ) : null}
                          </label>
                        </div>

                        <div className={styles.additionalSection}>
                          <p className={styles.additionalTitle}>추가 신청정보</p>
                          <div className={styles.fieldStack}>
                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>학교</span>
                              <input
                                type="text"
                                value={childSchool}
                                onChange={(event) => setChildSchool(event.target.value)}
                                disabled={isPending}
                                className={styles.input}
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>학생 특이사항</span>
                              <textarea
                                rows={3}
                                value={childNotes}
                                onChange={(event) => setChildNotes(event.target.value)}
                                disabled={isPending}
                                className={styles.textarea}
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>과목 경험 여부</span>
                              <select
                                value={subjectExperienceYn}
                                onChange={(event) => setSubjectExperienceYn(event.target.value)}
                                disabled={isPending}
                                className={styles.input}
                              >
                                <option value="">선택 안 함</option>
                                <option value="yes">있음</option>
                                <option value="no">없음</option>
                              </select>
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>경험 기간</span>
                              <input
                                type="text"
                                value={subjectExperienceDuration}
                                onChange={(event) => setSubjectExperienceDuration(event.target.value)}
                                disabled={isPending}
                                placeholder="예: 6개월, 1년"
                                className={styles.input}
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>현재 수준</span>
                              <input
                                type="text"
                                value={currentLevel}
                                onChange={(event) => setCurrentLevel(event.target.value)}
                                disabled={isPending}
                                placeholder="예: 기초 개념 가능, 입문 단계"
                                className={styles.input}
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>실제 등록 시 선호 시간대</span>
                              <input
                                type="text"
                                value={preferredRegularSchedule}
                                onChange={(event) => setPreferredRegularSchedule(event.target.value)}
                                disabled={isPending}
                                placeholder="예: 평일 5시 이후, 토요일 오전"
                                className={styles.input}
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>목표</span>
                              <select
                                value={goalType}
                                onChange={(event) => setGoalType(event.target.value)}
                                disabled={isPending}
                                className={styles.input}
                              >
                                <option value="">선택 안 함</option>
                                <option value="영재원">영재원</option>
                                <option value="고입">고입</option>
                                <option value="입시">입시</option>
                                <option value="대회">대회</option>
                                <option value="흥미">흥미</option>
                              </select>
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>목표 상세</span>
                              <textarea
                                rows={3}
                                value={goalNote}
                                onChange={(event) => setGoalNote(event.target.value)}
                                disabled={isPending}
                                className={styles.textarea}
                              />
                            </label>

                            <label className={styles.field}>
                              <span className={styles.fieldLabel}>문의사항</span>
                              <textarea
                                rows={3}
                                value={memo}
                                onChange={(event) => setMemo(event.target.value)}
                                disabled={isPending}
                                className={styles.textarea}
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    )}
                  </section>
                ) : null}

                {step === 3 ? (
                  <section className={styles.sectionStack}>
                    <div className={styles.headingBlock}>
                      <p className={styles.stepEyebrow}>신청 내용 확인</p>
                      <h3 className={styles.stepTitle}>마지막으로 내용을 확인해주세요.</h3>
                    </div>

                    <div className={styles.confirmCard}>
                      <p className={styles.confirmTitle}>{classTitle}</p>
                      <p className={styles.confirmSub}>{academyName ?? "학원 정보 준비 중"}</p>

                      <div className={styles.confirmDivider} />

                      <div className={styles.confirmRow}>
                        <span className={styles.confirmLabel}>일정</span>
                        <span className={styles.confirmValue}>{selectedScheduleSummary ?? "선택한 일정이 없습니다."}</span>
                      </div>
                      <div className={styles.confirmRow}>
                        <span className={styles.confirmLabel}>참여 학생</span>
                        <span className={styles.confirmValue}>
                          {childName || "학생 이름 미입력"} · {(getChildGradeLabel(childGrade) ?? childGrade) || "학년 미선택"}
                        </span>
                      </div>
                      <div className={styles.confirmRow}>
                        <span className={styles.confirmLabel}>담당 선생님</span>
                        <span className={styles.confirmValue}>{teacherLabel}</span>
                      </div>
                      <div className={styles.confirmRow}>
                        <span className={styles.confirmLabel}>체험수업 비용</span>
                        <span className={styles.confirmValue}>{trialPriceLabel}</span>
                      </div>
                    </div>

                    <div className={styles.agreementStack}>
                      <label className={styles.agreeRow}>
                        <input
                          type="checkbox"
                          checked={privacyAgreed}
                          onChange={(event) => setPrivacyAgreed(event.target.checked)}
                          disabled={isPending}
                        />
                        <span>체험수업 신청에 필요한 개인정보 수집·이용에 동의합니다.</span>
                      </label>
                      <label className={styles.agreeRow}>
                        <input
                          type="checkbox"
                          checked={thirdPartyAgreed}
                          onChange={(event) => setThirdPartyAgreed(event.target.checked)}
                          disabled={isPending}
                        />
                        <span>신청 정보가 해당 학원 및 담당 선생님에게 제공되는 것에 동의합니다.</span>
                      </label>
                      <label className={styles.agreeRow}>
                        <input
                          type="checkbox"
                          checked={guardianAgreed}
                          onChange={(event) => setGuardianAgreed(event.target.checked)}
                          disabled={isPending}
                        />
                        <span>학생의 법정대리인으로서 신청 정보를 제공하는 것에 동의합니다.</span>
                      </label>
                    </div>
                  </section>
                ) : null}

                {clientMessage || state.message ? (
                  <p className={clientMessage || state.status === "error" ? styles.errorText : styles.noticeText}>
                    {clientMessage || state.message}
                  </p>
                ) : null}
              </div>

              <div className={styles.sheetFooter}>
                {step === 1 ? (
                  <button type="button" className={styles.primaryButton} onClick={() => setStep(2)} disabled={!canProceedStep1}>
                    다음
                  </button>
                ) : null}

                {step === 2 ? (
                  <div className={styles.footerActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setStep(1)}>
                      이전
                    </button>
                    {!hasSession ? (
                      <Link href={signInHref} className={styles.primaryLinkButton}>
                        로그인하기
                      </Link>
                    ) : !isParentUser ? (
                      <button type="button" className={styles.primaryButton} disabled>
                        학부모 계정 필요
                      </button>
                    ) : (
                      <button type="button" className={styles.primaryButton} onClick={() => setStep(3)} disabled={!canProceedStep2}>
                        다음
                      </button>
                    )}
                  </div>
                ) : null}

                {step === 3 ? (
                  <div className={styles.footerActions}>
                    <button type="button" className={styles.secondaryButton} onClick={() => setStep(2)}>
                      이전
                    </button>
                    <button type="submit" className={styles.primaryButton} disabled={isPending || !canFinalSubmit}>
                      {isPending ? "신청 제출 중..." : "체험수업 신청하기"}
                    </button>
                  </div>
                ) : null}
              </div>

              <input type="hidden" name="selectedScheduleOptionId" value={selectedOptionId} />
              <input type="hidden" name="childId" value={selectedChildId} />
              <input type="hidden" name="childName" value={childName} />
              <input type="hidden" name="childGrade" value={childGrade} />
              <input type="hidden" name="childSchool" value={childSchool} />
              <input type="hidden" name="childNotes" value={childNotes} />
              <input type="hidden" name="subjectExperienceYn" value={subjectExperienceYn} />
              <input type="hidden" name="subjectExperienceDuration" value={subjectExperienceDuration} />
              <input type="hidden" name="currentLevel" value={currentLevel} />
              <input type="hidden" name="preferredRegularSchedule" value={preferredRegularSchedule} />
              <input type="hidden" name="goalType" value={goalType} />
              <input type="hidden" name="goalNote" value={goalNote} />
              <input type="hidden" name="memo" value={memo} />
              {privacyAgreed ? <input type="hidden" name="privacyAgreed" value="yes" /> : null}
              {thirdPartyAgreed ? <input type="hidden" name="thirdPartyAgreed" value="yes" /> : null}
              {guardianAgreed ? <input type="hidden" name="guardianAgreed" value="yes" /> : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
