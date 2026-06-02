"use client"

import { useActionState } from "react"

import {
  updateParentProfileAction,
  type UpdateParentProfileActionState
} from "@/features/my/actions/update-parent-profile"
import styles from "./parent-profile-form.module.css"

type ParentProfileFormProps = {
  initialName: string
  initialPhone: string | null
}

const initialState: UpdateParentProfileActionState = {
  status: "idle",
  message: ""
}

export const ParentProfileForm = ({ initialName, initialPhone }: ParentProfileFormProps) => {
  const [state, formAction, isPending] = useActionState(updateParentProfileAction, initialState)

  return (
    <form action={formAction} className={styles.form}>
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

      {state.message ? (
        <p
          className={state.status === "error" ? styles.errorMessage : styles.infoMessage}
        >
          {state.message}
        </p>
      ) : null}

      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "저장 중..." : "보호자 정보 저장"}
      </button>
    </form>
  )
}
