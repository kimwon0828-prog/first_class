"use client"

import { startTransition, useState } from "react"

import {
  LEARNER_GRADE_GROUPS,
  getLearnerGradesByGroup,
  normalizeLearnerGrade
} from "@/shared/constants/education-taxonomy"
import type { ChildProfile } from "@/shared/lib/db/adapter"

import type { ChildProfileActionState } from "@/features/children/actions/create-child-profile"
import styles from "./child-profile-form.module.css"

type ChildProfileFormProps = {
  mode: "create" | "update"
  formAction: (payload: FormData) => void
  isPending: boolean
  state: ChildProfileActionState
  initialValue?: ChildProfile | null
  onCancelEdit?: () => void
}

export const ChildProfileForm = ({
  mode,
  formAction,
  isPending,
  state,
  initialValue,
  onCancelEdit
}: ChildProfileFormProps) => {
  const normalizedInitialGrade = normalizeLearnerGrade(initialValue?.grade)
  const legacyGradeValue = initialValue?.grade?.trim() && !normalizedInitialGrade ? initialValue.grade.trim() : null
  const [values, setValues] = useState(() => ({
    name: initialValue?.name ?? "",
    grade: normalizedInitialGrade ?? "",
    schoolName: initialValue?.schoolName ?? "",
    notes: initialValue?.notes ?? "",
    currentLevel: initialValue?.currentLevel ?? "",
    interestSubjects: initialValue?.interestSubjects ?? "",
    goalNote: initialValue?.goalNote ?? ""
  }))

  const optionalCount = [values.schoolName, values.notes, values.currentLevel, values.interestSubjects, values.goalNote].filter(value => value.trim().length > 0).length

  return (
    // Successful saves close this editor; failed actions must not reset entered values.
    <form action={formAction} className={styles.form} onSubmit={event => {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      startTransition(() => formAction(formData))
    }}>
      {mode === "update" && initialValue ? <input type="hidden" name="childId" value={initialValue.id} /> : null}

      <label className={styles.field}>
        <span className={styles.label}>자녀 이름</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={30}
          value={values.name}
          onChange={event => setValues(current => ({ ...current, name: event.target.value }))}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학년</span>
        <select
          name="grade"
          required
          value={values.grade}
          onChange={event => setValues(current => ({ ...current, grade: event.target.value }))}
          disabled={isPending}
          className={styles.input}
        >
          <option value="" disabled>
            학년을 선택해주세요
          </option>
          {LEARNER_GRADE_GROUPS.map((group) => (
            <optgroup key={group.value} label={group.label}>
              {getLearnerGradesByGroup(group.value).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {legacyGradeValue ? (
          <p className={styles.infoMessage}>
            학년 정보를 확인해 주세요. 저장하려면 학년을 다시 선택해 주세요.
          </p>
        ) : null}
      </label>

      <details
        className={styles.details}
      >
        <summary className={styles.summary}>추가 정보 (선택){mode === "update" && optionalCount > 0 ? ` · ${optionalCount}개 입력됨` : ""}</summary>
        <div className={styles.detailsContent}>
          <label className={styles.field}>
            <span className={styles.label}>학교명</span>
            <input
              name="schoolName"
              type="text"
              maxLength={60}
              value={values.schoolName}
          onChange={event => setValues(current => ({ ...current, schoolName: event.target.value }))}
              disabled={isPending}
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>특이사항</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={500}
              value={values.notes}
          onChange={event => setValues(current => ({ ...current, notes: event.target.value }))}
              disabled={isPending}
              placeholder="성향, 주의사항, 알레르기 등을 적어 주세요."
              className={styles.textarea}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>현재 수준</span>
            <input
              name="currentLevel"
              type="text"
              maxLength={120}
              value={values.currentLevel}
          onChange={event => setValues(current => ({ ...current, currentLevel: event.target.value }))}
              disabled={isPending}
              placeholder="예: 입문 단계, 기초 개념 가능"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>관심 과목</span>
            <input
              name="interestSubjects"
              type="text"
              maxLength={120}
              value={values.interestSubjects}
          onChange={event => setValues(current => ({ ...current, interestSubjects: event.target.value }))}
              disabled={isPending}
              placeholder="예: 수학, 과학"
              className={styles.input}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>목표/고민 메모</span>
            <textarea
              name="goalNote"
              rows={4}
              maxLength={500}
              value={values.goalNote}
          onChange={event => setValues(current => ({ ...current, goalNote: event.target.value }))}
              disabled={isPending}
              placeholder="학습 목표나 상담 시 전달하고 싶은 내용을 적어 주세요."
              className={styles.textarea}
            />
          </label>
        </div>
      </details>

      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? styles.errorMessage : styles.infoMessage}
        >
          {state.message}
        </p>
      ) : null}

      <div className={styles.buttonStack}>
        {onCancelEdit ? <button type="button" onClick={onCancelEdit} disabled={isPending} className={styles.secondaryButton}>취소</button> : null}
        <button type="submit" disabled={isPending} className={styles.primaryButton}>{isPending ? "저장 중…" : "저장하기"}</button>
      </div>
    </form>
  )
}
