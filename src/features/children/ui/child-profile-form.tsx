"use client"

import { GRADE_OPTIONS, isValidGrade } from "@/shared/constants/grade-options"
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
  const legacyGradeValue = initialValue?.grade?.trim() && !isValidGrade(initialValue.grade) ? initialValue.grade.trim() : null

  return (
    <form action={formAction} className={styles.form}>
      {mode === "update" && initialValue ? <input type="hidden" name="childId" value={initialValue.id} /> : null}

      <label className={styles.field}>
        <span className={styles.label}>자녀 이름</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={30}
          defaultValue={initialValue?.name ?? ""}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>학년</span>
        <select
          name="grade"
          required
          defaultValue={legacyGradeValue ? "" : (initialValue?.grade ?? "")}
          disabled={isPending}
          className={styles.input}
        >
          <option value="" disabled>
            학년을 선택해주세요
          </option>
          {GRADE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {legacyGradeValue ? (
          <p className={styles.infoMessage}>
            현재 저장값은 `{legacyGradeValue}` 입니다. 새 저장 시에는 학년을 다시 선택해 주세요.
          </p>
        ) : null}
      </label>

      <details
        open={mode === "update"}
        className={styles.details}
      >
        <summary className={styles.summary}>선택 정보 더 입력하기</summary>
        <div className={styles.detailsContent}>
          <label className={styles.field}>
            <span className={styles.label}>학교명</span>
            <input
              name="schoolName"
              type="text"
              maxLength={60}
              defaultValue={initialValue?.schoolName ?? ""}
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
              defaultValue={initialValue?.notes ?? ""}
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
              defaultValue={initialValue?.currentLevel ?? ""}
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
              defaultValue={initialValue?.interestSubjects ?? ""}
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
              defaultValue={initialValue?.goalNote ?? ""}
              disabled={isPending}
              placeholder="학습 목표나 상담 시 전달하고 싶은 내용을 적어 주세요."
              className={styles.textarea}
            />
          </label>
        </div>
      </details>

      {state.message ? (
        <p
          className={state.status === "error" ? styles.errorMessage : styles.infoMessage}
        >
          {state.message}
        </p>
      ) : null}

      <div className={styles.buttonStack}>
        <button
          type="submit"
          disabled={isPending}
          className={styles.primaryButton}
        >
          {isPending
            ? mode === "create"
              ? "등록 중..."
              : "저장 중..."
            : mode === "create"
              ? "자녀 등록하기"
              : "저장하기"}
        </button>

        {mode === "update" && onCancelEdit ? (
          <button
            type="button"
            onClick={onCancelEdit}
            disabled={isPending}
            className={styles.secondaryButton}
          >
            취소
          </button>
        ) : null}
      </div>
    </form>
  )
}
