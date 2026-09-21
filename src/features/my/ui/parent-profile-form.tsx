"use client"

import { useActionState, useState, type FormEvent } from "react"

import {
  updateParentProfileAction,
  type UpdateParentProfileActionState
} from "@/features/my/actions/update-parent-profile"
import {
  MIN_PARENT_BIRTH_DATE,
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
    <form action={formAction} onSubmit={handleSubmit} className={styles.form} aria-busy={isPending}>
      <label className={styles.field}>
        <span className={styles.label}>이름 <span className={styles.required}>필수</span></span>
        <input
          name="name"
          autoComplete="name"
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
        <span className={styles.label}>연락처 <span className={styles.optional}>선택</span></span>
        <input
          name="phone"
          autoComplete="tel"
          type="tel"
          maxLength={20}
          defaultValue={initialPhone ?? ""}
          disabled={isPending}
          placeholder="010-0000-0000"
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>생년월일 <span className={styles.optional}>선택</span></span>
        <input
          name="parentBirthDate"
          autoComplete="bday"
          aria-describedby="profile-birth-note"
          type="date"
          min={MIN_PARENT_BIRTH_DATE}
          max={maxBirthDate}
          defaultValue={initialParentBirthDate ?? ""}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <p id="profile-birth-note" className={styles.note}>카카오 로그인으로 가입한 경우 생년월일이 비어 있을 수 있어요.</p>

      {clientMessage || state.message ? (
        <p
          role={clientMessage || state.status === "error" ? "alert" : "status"}
          className={clientMessage || state.status === "error" ? styles.errorMessage : styles.infoMessage}
        >
          {clientMessage || state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "저장 중..." : "저장하기"}
      </button>
    </form>
  )
}
