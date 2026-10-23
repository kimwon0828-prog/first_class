"use client"

import { useId, type InputHTMLAttributes, type ReactNode } from "react"

import styles from "./v2-field.module.css"

type V2TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "className"> & {
  label: ReactNode
  /** 입력 아래 안내. error 가 있으면 error 를 대신 보여준다. */
  helper?: ReactNode
  error?: ReactNode
  className?: string
}

/** Studio v2/TextField (Figma 2024:168). 라벨 · 입력 · 도움말을 한 묶음으로 그린다. */
export const V2TextField = ({ label, helper, error, className, id, type = "text", ...rest }: V2TextFieldProps) => {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const message = error ?? helper
  const messageId = message ? `${inputId}-message` : undefined

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label className={styles.label} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        className={`${styles.control} ${styles.input}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={messageId}
        {...rest}
      />
      {message ? (
        <p id={messageId} className={error ? `${styles.helper} ${styles.error}` : styles.helper}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
