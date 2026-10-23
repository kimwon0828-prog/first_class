import type { ButtonHTMLAttributes, ReactNode } from "react"

import styles from "./v2-button.module.css"

export type V2ButtonVariant = "primary" | "tonal" | "outline" | "ghost"
export type V2ButtonSize = "lg" | "md" | "sm"

type V2ButtonClassOptions = {
  variant?: V2ButtonVariant
  size?: V2ButtonSize
  className?: string
}

/**
 * 버튼 모양의 className.
 *
 * Link 처럼 <button> 이 아닌 요소를 버튼 모양으로 그릴 때 쓴다. 모양은 이 함수 하나에서만 정한다.
 */
export const v2ButtonClassName = ({ variant = "primary", size = "md", className }: V2ButtonClassOptions = {}) =>
  [styles.button, styles[variant], styles[size], className].filter(Boolean).join(" ")

type V2ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> &
  V2ButtonClassOptions & {
    /** 글자 앞 아이콘. lg·md 는 18px, sm 은 16px 로 넣는다. */
    icon?: ReactNode
  }

/** Studio v2/Button (Figma 2024:145). 기본 type 은 "button" 이다 — form 안에서 의도치 않게 submit 하지 않게. */
export const V2Button = ({ variant, size, className, icon, children, type = "button", ...rest }: V2ButtonProps) => (
  <button type={type} className={v2ButtonClassName({ variant, size, className })} {...rest}>
    {icon ? <span className={styles.icon}>{icon}</span> : null}
    {children}
  </button>
)
