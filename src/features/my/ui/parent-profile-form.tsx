"use client"

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react"

import { unstable_rethrow } from "next/navigation"

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

export type ParentProfileValues = {
  name: string
  phone: string | null
  parentBirthDate: string | null
}

type ParentProfileFormProps = {
  phoneReadOnly?: boolean
  saveAction?: typeof updateParentProfileAction
  birthDateNote?: string
  email?: string | null
  onCancel?: () => void
  onSaved?: (values: ParentProfileValues) => void
  onPendingChange?: (pending: boolean) => void
  initialName: string
  initialPhone: string | null
  initialParentBirthDate: string | null
}

const initialState: UpdateParentProfileActionState = {
  status: "idle",
  message: ""
}

// Keep transport failures in the sheet too; preserve Next auth redirects.
async function saveProfile(previous: UpdateParentProfileActionState, formData: FormData, action = updateParentProfileAction): Promise<UpdateParentProfileActionState> {
  try {
    return await action(previous, formData)
  } catch (error) {
    unstable_rethrow(error)
    return { status: "error", message: "보호자 정보를 저장하지 못했어요. 잠시 후 다시 시도해 주세요." }
  }
}

export const ParentProfileForm = ({
  phoneReadOnly = false,
  saveAction = updateParentProfileAction,
  birthDateNote = "카카오 로그인으로 가입한 경우 생년월일이 비어 있을 수 있어요.",
  initialName,
  initialPhone,
  initialParentBirthDate,
  email, onCancel, onSaved, onPendingChange
}: ParentProfileFormProps) => {
  const [state, formAction, isPending] = useActionState((previous: UpdateParentProfileActionState, formData: FormData) => saveProfile(previous, formData, saveAction), initialState)
  const [clientMessage, setClientMessage] = useState("")
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone ?? "")
  const [birthDate, setBirthDate] = useState(initialParentBirthDate ?? "")
  const submitted = useRef<ParentProfileValues | null>(null)
  const maxBirthDate = getTodayDateValue()

  useEffect(() => {
    onPendingChange?.(isPending)
    return () => onPendingChange?.(false)
  }, [isPending, onPendingChange])
  useEffect(() => {
    if (state.status === "success" && submitted.current) {
      const values = submitted.current
      submitted.current = null
      onSaved?.(values)
    }
  }, [state, onSaved])

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

    submitted.current = {
      name: String(formData.get("name") ?? "").trim(),
      phone: String(formData.get("phone") ?? "").trim() || null,
      parentBirthDate: parentBirthDateResult.parentBirthDate
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
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>연락처 <span className={styles.optional}>{phoneReadOnly ? "인증 완료" : "선택"}</span></span>
        <input
          name="phone"
          readOnly={phoneReadOnly}
          autoComplete="tel"
          type="tel"
          maxLength={20}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
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
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          disabled={isPending}
          className={styles.input}
        />
      </label>

      <p id="profile-birth-note" className={styles.note}>{birthDateNote}</p>

      {email ? <div className={styles.field}><span className={styles.label}>이메일</span><p className={styles.readOnly}>{email}</p></div> : null}

      {clientMessage || state.message ? (
        <p
          role={clientMessage || state.status === "error" ? "alert" : "status"}
          className={clientMessage || state.status === "error" ? styles.errorMessage : styles.infoMessage}
        >
          {clientMessage || state.message}
        </p>
      ) : null}

      <div className={styles.actions}>
      {onCancel ? <button type="button" disabled={isPending} onClick={onCancel} className={styles.cancelButton}>취소</button> : null}
      <button type="submit" disabled={isPending} className={styles.submitButton}>
        {isPending ? "저장 중..." : "저장"}
      </button>
      </div>
    </form>
  )
}
