"use client"

import { useActionState } from "react"

import {
  updateApplicationAssigneeAction,
  type UpdateApplicationAssigneeActionState
} from "@/features/studio/actions/update-application-assignee"
import type { StudioTeacherOption } from "@/shared/lib/db/adapter"

import styles from "./application-assignee-form.module.css"

const initialState: UpdateApplicationAssigneeActionState = {
  status: "idle",
  message: ""
}

type ApplicationAssigneeFormProps = {
  applicationId: string
  currentAssignedTeacherId: string | null
  currentAssignedTeacherName: string | null
  options: StudioTeacherOption[]
  optionsError?: string | null
}

export const ApplicationAssigneeForm = ({
  applicationId,
  currentAssignedTeacherId,
  currentAssignedTeacherName,
  options,
  optionsError = null
}: ApplicationAssigneeFormProps) => {
  const action = updateApplicationAssigneeAction.bind(null, applicationId)
  const [state, formAction, isPending] = useActionState(action, initialState)

  return (
    <section className={styles.card} aria-label="담당 선생님 배정">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>담당 선생님</h2>
          <p className={styles.description}>
            신청별 담당 선생님을 배정하고, 필요하면 언제든 변경할 수 있어요.
          </p>
        </div>
      </div>

      <div className={styles.currentRow}>
        <span className={styles.currentLabel}>현재 배정</span>
        <span className={styles.currentValue}>{currentAssignedTeacherName ?? "미배정"}</span>
      </div>

      <form action={formAction} className={styles.form}>
        {state.message ? (
          <div className={`${styles.message} ${state.status === "error" ? styles.messageError : ""}`}>
            {state.message}
          </div>
        ) : null}

        {optionsError ? <div className={`${styles.message} ${styles.messageError}`}>{optionsError}</div> : null}

        <label className={styles.field}>
          <span className={styles.label}>배정할 선생님</span>
          <select
            name="assignedTeacherId"
            defaultValue={currentAssignedTeacherId ?? ""}
            disabled={isPending}
            className={styles.select}
          >
            <option value="">미배정</option>
            {options.map((option) => (
              <option key={option.teacherId} value={option.teacherId}>
                {option.teacherName}
              </option>
            ))}
          </select>
        </label>

        <p className={styles.help}>
          현재 학원에 등록된 선생님만 선택할 수 있습니다. 미배정으로 두고 나중에 다시 지정해도 됩니다.
        </p>

        <button type="submit" disabled={isPending || Boolean(optionsError)} className={styles.primaryButton}>
          {isPending ? "저장 중..." : "담당 선생님 저장"}
        </button>
      </form>
    </section>
  )
}
