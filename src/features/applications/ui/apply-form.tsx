"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useMemo, useState } from "react"

import {
  createTrialApplicationAction,
  type CreateTrialApplicationActionState
} from "@/features/applications/actions/create-trial-application"
import type { AvailableScheduleSlot, ChildProfile } from "@/shared/lib/db/adapter"
import styles from "./apply-form.module.css"

type ApplyFormProps = {
  classId: string
  availableSlots: AvailableScheduleSlot[]
  slotsError: string | null
  childProfiles: ChildProfile[]
  childProfilesError: string | null
  parentNameDefault: string
  parentPhoneDefault: string | null
}

const initialState: CreateTrialApplicationActionState = {
  status: "idle",
  message: ""
}

const gradeOptions = [
  "유아",
  "초1",
  "초2",
  "초3",
  "초4",
  "초5",
  "초6",
  "중1",
  "중2",
  "중3",
  "고1",
  "고2",
  "고3"
]

const formatSlot = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit"
  })
}

export const ApplyForm = ({
  classId,
  availableSlots,
  slotsError,
  childProfiles,
  childProfilesError,
  parentNameDefault,
  parentPhoneDefault
}: ApplyFormProps) => {
  const router = useRouter()
  const boundAction = createTrialApplicationAction.bind(null, classId)
  const [state, formAction, isPending] = useActionState(boundAction, initialState)
  const [selectedChildId, setSelectedChildId] = useState("")
  const [selectedSlotId, setSelectedSlotId] = useState("")
  const [childName, setChildName] = useState("")
  const [childGrade, setChildGrade] = useState("")
  const [childSchool, setChildSchool] = useState("")
  const [childNotes, setChildNotes] = useState("")
  const [currentLevel, setCurrentLevel] = useState("")
  const [goalNote, setGoalNote] = useState("")
  const [parentName, setParentName] = useState(parentNameDefault)
  const [parentPhone, setParentPhone] = useState(parentPhoneDefault ?? "")

  const selectedSlot = useMemo(
    () => availableSlots.find((slot) => slot.id === selectedSlotId) ?? null,
    [availableSlots, selectedSlotId]
  )
  const selectedChild = useMemo(
    () => childProfiles.find((child) => child.id === selectedChildId) ?? null,
    [childProfiles, selectedChildId]
  )
  const hasSelectableSlots = useMemo(
    () => availableSlots.some((slot) => !slot.isClosed),
    [availableSlots]
  )
  const canSubmit =
    !slotsError && hasSelectableSlots && Boolean(selectedSlot && !selectedSlot.isClosed)

  useEffect(() => {
    if (selectedSlot?.isClosed) {
      setSelectedSlotId("")
    }
  }, [selectedSlot?.isClosed])

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

  return (
    <form action={formAction} className={styles.form}>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>보호자 정보</h2>
        <div className={styles.fieldStack}>
          <div className={styles.field}>
            <span className={styles.label}>이름</span>
            <input
              name="parentName"
              type="text"
              required
              minLength={2}
              maxLength={30}
              value={parentName}
              onChange={(event) => {
                setParentName(event.target.value)
              }}
              disabled={isPending}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.label}>연락처</span>
            <input
              name="parentPhone"
              type="tel"
              required
              minLength={8}
              maxLength={20}
              value={parentPhone}
              onChange={(event) => {
                setParentPhone(event.target.value)
              }}
              disabled={isPending}
              placeholder="010-0000-0000"
              className={styles.input}
            />
          </div>
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
                  <option key={child.id} value={child.id}>
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
            <input
              name="childGrade"
              type="text"
              list="child-grade-options"
              required
              maxLength={30}
              value={childGrade}
              onChange={(event) => {
                setChildGrade(event.target.value)
              }}
              disabled={isPending}
              placeholder="예: 초3, 7세"
              className={styles.input}
            />
            <datalist id="child-grade-options">
              {gradeOptions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
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
            {availableSlots.map((slot) => (
              <label
                key={slot.id}
                className={`${styles.slotItem} ${slot.isClosed ? styles.slotItemDisabled : ""}`}
              >
                <input
                  className={styles.radio}
                  type="radio"
                  name="selectedScheduleBlockId"
                  value={slot.id}
                  required={hasSelectableSlots}
                  checked={selectedSlotId === slot.id}
                  onChange={() => {
                    setSelectedSlotId(slot.id)
                  }}
                  disabled={isPending || slot.isClosed}
                />
                <span className={styles.slotText}>
                  {formatSlot(slot.startAt)}
                  {slot.isClosed ? (
                    <span className={styles.slotClosed}>마감</span>
                  ) : (
                    <span className={styles.slotMeta}>남은 {slot.remainingCount}자리</span>
                  )}
                </span>
              </label>
            ))}
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
        <h2 className={styles.cardTitle}>개인정보 동의</h2>
        <div className={styles.agreeRow}>
          <input className={styles.checkbox} type="checkbox" name="privacyAgree" value="yes" />
          <div>
            <div className={styles.agreeText}>신청 진행을 위해 개인정보 제공에 동의합니다.</div>
            <p className={styles.agreeSub}>
              연락처/자녀 정보는 수업 안내 및 일정 확정을 위해 학원/선생님에게 전달될 수 있어요.
            </p>
          </div>
        </div>
      </section>

      {state.message ? (
        <p className={state.status === "error" ? styles.dangerText : styles.noticeText}>
          {state.message}
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
