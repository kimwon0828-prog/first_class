"use client"

import { useActionState, useState, type FormEvent } from "react"

import {
  updateParentProfileAction,
  type UpdateParentProfileActionState
} from "@/features/my/actions/update-parent-profile"
import {
  MIN_PARENT_BIRTH_DATE,
  formatParentBirthDateLabel,
  getTodayDateValue,
  validateParentBirthDate
} from "@/shared/lib/parent-birth-date"
import styles from "./parent-profile-form.module.css"

type ParentProfileFormProps = {
  initialName: string
  initialPhone: string | null
  initialParentBirthDate: string | null
}

const initialState: UpdateParentProfileActionState = {
  status: "idle",
  message: ""
}

export const ParentProfileForm = ({
  initialName,
  initialPhone,
  initialParentBirthDate
}: ParentProfileFormProps) => {
  const [state, formAction, isPending] = useActionState(updateParentProfileAction, initialState)
  const [clientMessage, setClientMessage] = useState("")
  const maxBirthDate = getTodayDateValue()
  const birthDateLabel = formatParentBirthDateLabel(initialParentBirthDate)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (isPending) {
      event.preventDefault()
      return
    }

    const formData = new FormData(event.currentTarget)
    const parentBirthDateResult = validateParentBirthDate(formData.get("parentBirthDate"), {
      required: false
    })

    if (!parentBirthDateResult.ok) {
      event.preventDefault()
      setClientMessage(parentBirthDateResult.message)
      return
    }

    setClientMessage("")
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>보호자명</span>
        <input
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={30}
          defaultValue={initialName}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>보호자 연락처</span>
        <input
          name="phone"
          type="tel"
          maxLength={20}
          defaultValue={initialPhone ?? ""}
          disabled={isPending}
          placeholder="010-0000-0000"
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>생년월일</span>
        <input
          name="parentBirthDate"
          type="date"
          min={MIN_PARENT_BIRTH_DATE}
          max={maxBirthDate}
          defaultValue={initialParentBirthDate ?? ""}
          disabled={isPending}
          className={styles.input}
          aria-describedby="my-parent-birth-date-hint"
        />
        <span id="my-parent-birth-date-hint" className={styles.hint}>
          현재 등록값: {birthDateLabel}. 비어 있으면 미입력 상태로 저장됩니다.
        </span>
      </label>

      {clientMessage || state.message ? (
        <p
          className={clientMessage || state.status === "error" ? styles.errorMessage : styles.infoMessage}
        >
          {clientMessage || state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "저장 중..." : "보호자 정보 저장"}
      </button>
    </form>
  )
}
