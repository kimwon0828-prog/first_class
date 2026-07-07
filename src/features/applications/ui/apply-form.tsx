"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import { useActionState, useEffect, useMemo, useState, type FormEvent } from "react"

import {
  formatStoredTargetGrades,
  GRADE_OPTIONS,
  isChildEligibleForClass,
  isValidGrade
} from "@/shared/constants/grade-options"
import {
  createTrialApplicationAction,
  type CreateTrialApplicationActionState
} from "@/features/applications/actions/create-trial-application"
import type { AvailableScheduleSlot, ChildProfile } from "@/shared/lib/db/adapter"
import styles from "./apply-form.module.css"

type ApplyFormProps = {
  classId: string
  classTargetAge: string
  availableSlots: AvailableScheduleSlot[]
  slotsError: string | null
  childProfiles: ChildProfile[]
  childProfilesError: string | null
  parentName: string
  parentPhone: string | null
}

const initialState: CreateTrialApplicationActionState = {
  status: "idle",
  message: ""
}

const gradeOptions = GRADE_OPTIONS
const WEEKDAY_LABELS = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"]

const formatSlotDateLine = (startAt: string, endAt: string) => {
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }

  const dateText = `${startDate.getFullYear()}. ${String(startDate.getMonth() + 1).padStart(2, "0")}. ${String(
    startDate.getDate()
  ).padStart(2, "0")}.`
  const weekdayText = WEEKDAY_LABELS[startDate.getDay()] ?? ""

  return `${dateText} ${weekdayText}`
}

const formatSlotTimeLine = (startAt: string, endAt: string, remainingCount: number) => {
  const startDate = new Date(startAt)
  const endDate = new Date(endAt)

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null
  }

  const timeText = `${String(startDate.getHours()).padStart(2, "0")}:${String(
    startDate.getMinutes()
  ).padStart(2, "0")}~${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`

  return `${timeText} · 남은 ${remainingCount}자리`
}

const resolveSlotDisplay = (slot: AvailableScheduleSlot) => {
  const dateLine = formatSlotDateLine(slot.startAt, slot.endAt)
  const timeLine = formatSlotTimeLine(slot.startAt, slot.endAt, slot.remainingCount)

  if (dateLine && timeLine) {
    return {
      primaryLine: dateLine,
      secondaryLine: timeLine
    }
  }

  return {
    primaryLine: slot.label || slot.startAt,
    secondaryLine: slot.isClosed ? null : `남은 ${slot.remainingCount}자리`
  }
}

export const ApplyForm = ({
  classId,
  classTargetAge,
  availableSlots,
  slotsError,
  childProfiles,
  childProfilesError,
  parentName,
  parentPhone
}: ApplyFormProps) => {
  const router = useRouter()
  const boundAction = createTrialApplicationAction.bind(null, classId)
  const [state, formAction, isPending] = useActionState(boundAction, initialState)
  const [selectedChildId, setSelectedChildId] = useState("")
  const [selectedOptionId, setSelectedOptionId] = useState("")
  const [childName, setChildName] = useState("")
  const [childGrade, setChildGrade] = useState("")
  const [childSchool, setChildSchool] = useState("")
  const [childNotes, setChildNotes] = useState("")
  const [currentLevel, setCurrentLevel] = useState("")
  const [goalNote, setGoalNote] = useState("")
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [thirdPartyAgreed, setThirdPartyAgreed] = useState(false)
  const [guardianAgreed, setGuardianAgreed] = useState(false)
  const [clientMessage, setClientMessage] = useState("")

  const selectedSlot = useMemo(
    () => availableSlots.find((slot) => slot.optionId === selectedOptionId) ?? null,
    [availableSlots, selectedOptionId]
  )
  const selectedChild = useMemo(
    () => childProfiles.find((child) => child.id === selectedChildId) ?? null,
    [childProfiles, selectedChildId]
  )
  const classTargetGradeLabel = useMemo(() => formatStoredTargetGrades(classTargetAge), [classTargetAge])
  const isGradeEligible = useMemo(() => {
    if (!childGrade.trim()) {
      return true
    }

    return isChildEligibleForClass(childGrade, classTargetAge)
  }, [childGrade, classTargetAge])
  const legacyChildGradeValue = childGrade.trim() && !isValidGrade(childGrade) ? childGrade.trim() : null
  const hasSelectableSlots = useMemo(
    () => availableSlots.some((slot) => !slot.isClosed),
    [availableSlots]
  )
  const canSubmit =
    !slotsError && hasSelectableSlots && Boolean(selectedSlot && !selectedSlot.isClosed) && isGradeEligible
  const requiredAgreementsChecked = privacyAgreed && thirdPartyAgreed && guardianAgreed

  useEffect(() => {
    if (selectedSlot?.isClosed) {
      setSelectedOptionId("")
    }
  }, [selectedSlot?.isClosed])

  useEffect(() => {
    const selectableSlots = availableSlots.filter((slot) => !slot.isClosed)

    if (selectableSlots.length === 1) {
      setSelectedOptionId(selectableSlots[0].optionId)
      return
    }

    setSelectedOptionId((current) =>
      availableSlots.some((slot) => slot.optionId === current && !slot.isClosed) ? current : ""
    )
  }, [availableSlots])

  useEffect(() => {
    if (!selectedChild) {
      return
    }

    setChildName(selectedChild.name)
    setChildGrade(selectedChild.grade)
    setChildSchool(selectedChild.schoolName ?? "")
    setChildNotes(selectedChild.notes ?? "")
    setCurrentLevel(selectedChild.currentLevel ?? "")
    setGoalNote(selectedChild.goalNote ?? "")
  }, [selectedChild])

  useEffect(() => {
    if (state.status === "success" && state.redirectTo) {
      router.replace(state.redirectTo)
    }
  }, [router, state.redirectTo, state.status])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!requiredAgreementsChecked) {
      event.preventDefault()
      setClientMessage("체험수업 신청에 필요한 필수 동의 항목을 확인해주세요.")
      return
    }

    if (!isGradeEligible) {
      event.preventDefault()
      setClientMessage("선택한 자녀의 학년이 이 수업의 대상 학년과 맞지 않아 신청할 수 없어요.")
      return
    }

    setClientMessage("")
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={styles.form}>
      <section className={styles.card}>
        <div className={styles.contactSummary}>
          <p className={styles.contactTitle}>연락처 확인</p>
          <p className={styles.contactDescription}>
            학원에서 체험수업 일정 조율을 위해 계정에 등록된 연락처로 연락드릴 수 있어요.
          </p>
          <div className={styles.contactMeta}>
            <span className={styles.contactMetaLabel}>보호자명</span>
            <span className={styles.contactMetaValue}>{parentName}</span>
          </div>
          <div className={styles.contactMeta}>
            <span className={styles.contactMetaLabel}>연락처</span>
            <span className={styles.contactMetaValue}>{parentPhone ?? "등록된 연락처가 없습니다."}</span>
          </div>
          {!parentPhone ? <p className={styles.dangerText}>체험수업 신청을 위해 연락처 정보가 필요합니다.</p> : null}
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>아이 정보</h2>

        {childProfilesError ? (
          <p className={styles.dangerText}>
            {childProfilesError} 자녀를 선택하지 않고 직접 입력으로 신청할 수 있습니다.
          </p>
        ) : null}

        <div className={styles.fieldStack}>
          {childProfiles.length > 0 ? (
            <div className={styles.field}>
              <span className={styles.label}>자녀 선택</span>
              <select
                name="childId"
                value={selectedChildId}
                disabled={isPending}
                onChange={(event) => {
                  setSelectedChildId(event.target.value)
                }}
                className={styles.select}
              >
                <option value="">직접 입력</option>
                {childProfiles.map((child) => (
                  <option
                    key={child.id}
                    value={child.id}
                    disabled={!isChildEligibleForClass(child.grade, classTargetAge)}
                  >
                    {child.name} / {child.grade}
                  </option>
                ))}
              </select>
              <p className={styles.help}>
                등록한 자녀를 선택하면 학생 정보를 자동으로 채워 드립니다.
              </p>
            </div>
          ) : null}

          <div className={styles.field}>
            <span className={styles.label}>아이 이름</span>
            <input
              name="childName"
              type="text"
              required
              minLength={2}
              maxLength={30}
              value={childName}
              onChange={(event) => {
                setChildName(event.target.value)
              }}
              disabled={isPending}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>학년</span>
            <select
              name="childGrade"
              required
              value={childGrade}
              onChange={(event) => {
                setChildGrade(event.target.value)
              }}
              disabled={isPending}
              className={styles.select}
            >
              <option value="" disabled>
                학년을 선택해주세요
              </option>
              {legacyChildGradeValue ? (
                <option value={legacyChildGradeValue}>{legacyChildGradeValue} (기존 값)</option>
              ) : null}
              {gradeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <p className={styles.help}>대상 학년: {classTargetGradeLabel}</p>
            {!isGradeEligible && childGrade.trim() ? (
              <p className={styles.dangerText}>
                선택한 자녀의 학년이 이 수업의 대상 학년과 맞지 않아 신청할 수 없어요.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <details className={styles.details}>
        <summary className={styles.detailsSummary}>선택 정보 추가 입력</summary>
        <div className={styles.detailsBody}>
          <div className={styles.field}>
            <span className={styles.label}>학교</span>
            <input
              name="childSchool"
              type="text"
              maxLength={60}
              value={childSchool}
              onChange={(event) => {
                setChildSchool(event.target.value)
              }}
              disabled={isPending}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>학생 특이사항</span>
            <textarea
              name="childNotes"
              rows={3}
              maxLength={500}
              value={childNotes}
              onChange={(event) => {
                setChildNotes(event.target.value)
              }}
              disabled={isPending}
              placeholder="알레르기, 성향, 주의사항이 있으면 적어 주세요."
              className={styles.textarea}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>과목 경험 여부</span>
            <select
              name="subjectExperienceYn"
              defaultValue=""
              disabled={isPending}
              className={styles.select}
            >
              <option value="">선택 안 함</option>
              <option value="yes">있음</option>
              <option value="no">없음</option>
            </select>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>경험 기간</span>
            <input
              name="subjectExperienceDuration"
              type="text"
              maxLength={60}
              disabled={isPending}
              placeholder="예: 6개월, 1년"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>현재 수준</span>
            <input
              name="currentLevel"
              type="text"
              maxLength={80}
              value={currentLevel}
              onChange={(event) => {
                setCurrentLevel(event.target.value)
              }}
              disabled={isPending}
              placeholder="예: 기초 개념 가능, 입문 단계"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>실제 등록 시 선호 시간대</span>
            <input
              name="preferredRegularSchedule"
              type="text"
              maxLength={120}
              disabled={isPending}
              placeholder="예: 평일 5시 이후, 토요일 오전"
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>목표</span>
            <select name="goalType" defaultValue="" disabled={isPending} className={styles.select}>
              <option value="">선택 안 함</option>
              <option value="영재원">영재원</option>
              <option value="고입">고입</option>
              <option value="입시">입시</option>
              <option value="대회">대회</option>
              <option value="흥미">흥미</option>
            </select>
          </div>

          <div className={styles.field}>
            <span className={styles.label}>목표 상세</span>
            <textarea
              name="goalNote"
              rows={3}
              maxLength={500}
              value={goalNote}
              onChange={(event) => {
                setGoalNote(event.target.value)
              }}
              disabled={isPending}
              placeholder="목표나 상담 희망 내용을 자유롭게 적어 주세요."
              className={styles.textarea}
            />
          </div>
        </div>
      </details>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>희망 일정</h2>

        {slotsError ? <p className={styles.dangerText}>{slotsError}</p> : null}

        {!slotsError && availableSlots.length === 0 ? (
          <p className={styles.help}>현재 선택 가능한 예약 시간대가 없습니다.</p>
        ) : null}

        {!slotsError && availableSlots.length > 0 ? (
          <div className={styles.scheduleList}>
            {availableSlots.map((slot) => {
              const slotDisplay = resolveSlotDisplay(slot)

              return (
                <label
                  key={slot.id}
                  className={`${styles.slotItem} ${slot.isClosed ? styles.slotItemDisabled : ""}`}
                >
                  <input
                    className={styles.radio}
                    type="radio"
                    name="selectedScheduleOptionId"
                    value={slot.optionId}
                    required={hasSelectableSlots}
                    checked={selectedOptionId === slot.optionId}
                    onChange={() => {
                      setSelectedOptionId(slot.optionId)
                    }}
                    disabled={isPending || slot.isClosed}
                  />
                  <span className={styles.slotText}>
                    <span className={styles.slotPrimaryLine}>{slotDisplay.primaryLine}</span>
                    {slot.isClosed ? (
                      <span className={styles.slotClosed}>마감</span>
                    ) : slotDisplay.secondaryLine ? (
                      <span className={styles.slotMeta}>{slotDisplay.secondaryLine}</span>
                    ) : null}
                  </span>
                </label>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>문의사항</h2>
        <div className={styles.fieldStack}>
          <div className={styles.field}>
            <span className={styles.label}>남길 내용</span>
            <textarea
              name="memo"
              rows={4}
              maxLength={500}
              disabled={isPending}
              placeholder="아이의 현재 수준이나 궁금한 점을 남겨주세요."
              className={styles.textarea}
            />
            <p className={styles.help}>학원/선생님이 수업 준비에 참고합니다.</p>
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>필수 동의</h2>
        <div className={styles.agreementStack}>
          <label className={styles.agreeRow}>
            <input
              className={styles.checkbox}
              type="checkbox"
              name="privacyAgreed"
              value="yes"
              checked={privacyAgreed}
              onChange={(event) => setPrivacyAgreed(event.target.checked)}
              disabled={isPending}
            />
            <div>
              <div className={styles.agreeText}>
                <span className={styles.requiredText}>[필수]</span> 체험수업 신청에 필요한 개인정보 수집·이용에
                동의합니다.
              </div>
              <p className={styles.agreeSub}>
                학생 정보, 희망 일정, 요청사항은 체험수업 신청 접수와 일정 조율을 위해 사용됩니다.{" "}
                <Link href="/privacy" target="_blank" rel="noreferrer" className={styles.inlineLink}>
                  전문 보기
                </Link>
              </p>
            </div>
          </label>

          <label className={styles.agreeRow}>
            <input
              className={styles.checkbox}
              type="checkbox"
              name="thirdPartyAgreed"
              value="yes"
              checked={thirdPartyAgreed}
              onChange={(event) => setThirdPartyAgreed(event.target.checked)}
              disabled={isPending}
            />
            <div>
              <div className={styles.agreeText}>
                <span className={styles.requiredText}>[필수]</span> 신청 정보가 해당 학원 및 담당 선생님에게
                제공되는 것에 동의합니다.
              </div>
              <p className={styles.agreeSub}>
                연락처와 학생 정보는 해당 신청을 처리하는 학원 및 담당 선생님에게 전달될 수 있습니다.{" "}
                <Link
                  href="/third-party-consent"
                  target="_blank"
                  rel="noreferrer"
                  className={styles.inlineLink}
                >
                  전문 보기
                </Link>
              </p>
            </div>
          </label>

          <label className={styles.agreeRow}>
            <input
              className={styles.checkbox}
              type="checkbox"
              name="guardianAgreed"
              value="yes"
              checked={guardianAgreed}
              onChange={(event) => setGuardianAgreed(event.target.checked)}
              disabled={isPending}
            />
            <div>
              <div className={styles.agreeText}>
                <span className={styles.requiredText}>[필수]</span> 학생의 법정대리인으로서 체험수업 신청에 필요한
                정보를 제공하는 것에 동의합니다.
              </div>
            </div>
          </label>
        </div>
      </section>

      {clientMessage || state.message ? (
        <p className={clientMessage || state.status === "error" ? styles.dangerText : styles.noticeText}>
          {clientMessage || state.message}
        </p>
      ) : null}

      <div className={styles.fixedCta}>
        <button type="submit" disabled={isPending || !canSubmit} className={styles.ctaButton}>
          {isPending ? "신청 제출 중..." : "신청 완료하기"}
        </button>
      </div>
    </form>
  )
}
