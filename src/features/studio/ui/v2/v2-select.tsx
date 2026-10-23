"use client"

import { useId, type ReactNode, type SelectHTMLAttributes } from "react"

import { V2ChevronDownIcon } from "./v2-icons"
import styles from "./v2-field.module.css"

export type V2SelectOption = {
  value: string
  label: string
  disabled?: boolean
}

type V2SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children"> & {
  label: ReactNode
  options: readonly V2SelectOption[]
  /** 값이 없을 때 맨 위에 보이는 안내. 고를 수 없는 빈 값으로 들어간다. */
  placeholder?: string
  helper?: ReactNode
  error?: ReactNode
  className?: string
}

/**
 * 선택 입력 (Figma 수업 등록 화면의 "input + Icon/chevronDown", 2173:186).
 *
 * 브라우저 기본 select 를 그대로 쓴다 — 키보드 · 스크린리더 · 모바일 선택기가 따라온다.
 * 모양만 v2 로 덮는다.
 */
export const V2Select = ({
  label,
  options,
  placeholder,
  helper,
  error,
  className,
  id,
  ...rest
}: V2SelectProps) => {
  const generatedId = useId()
  const selectId = id ?? generatedId
  const message = error ?? helper
  const messageId = message ? `${selectId}-message` : undefined

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label className={styles.label} htmlFor={selectId}>
        {label}
      </label>
      <div className={styles.selectWrap}>
        <select
          id={selectId}
          className={`${styles.control} ${styles.select}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          {...rest}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
        <V2ChevronDownIcon className={styles.selectIcon} size={16} />
      </div>
      {message ? (
        <p id={messageId} className={error ? `${styles.helper} ${styles.error}` : styles.helper}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
