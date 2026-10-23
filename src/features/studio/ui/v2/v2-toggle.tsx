import type { InputHTMLAttributes, ReactNode } from "react"

import styles from "./v2-toggle.module.css"

type V2ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className" | "role"> & {
  /** 화면에 보이는 라벨. 라벨 없이 쓸 때는 aria-label 을 꼭 넘긴다. */
  label?: ReactNode
  className?: string
}

/**
 * Studio v2/Toggle (Figma 2024:177).
 *
 * checkbox 위에 role="switch" 를 얹었다. form 안에서는 name 으로 그대로 제출되고,
 * checked / defaultChecked / onChange 도 일반 checkbox 와 같다.
 */
export const V2Toggle = ({ label, className, ...rest }: V2ToggleProps) => (
  <label className={[styles.root, className].filter(Boolean).join(" ")}>
    <input type="checkbox" role="switch" className={styles.input} {...rest} />
    <span className={styles.track} aria-hidden="true" />
    {label ? <span>{label}</span> : null}
  </label>
)
