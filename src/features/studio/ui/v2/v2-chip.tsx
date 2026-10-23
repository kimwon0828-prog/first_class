import type { ButtonHTMLAttributes, ReactNode } from "react"

import styles from "./v2-chip.module.css"

type V2ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
  label: ReactNode
  /** 라벨 옆 건수. 없으면 표시하지 않는다. */
  count?: number | string | null
  selected?: boolean
  className?: string
}

/**
 * Studio v2/Chip (Figma 2024:152).
 *
 * 선택 여부는 aria-pressed 로 함께 알린다 — 색만으로 상태를 전하지 않는다.
 */
export const V2Chip = ({ label, count, selected = false, className, type = "button", ...rest }: V2ChipProps) => (
  <button
    type={type}
    aria-pressed={selected}
    className={[styles.chip, selected ? styles.selected : null, className].filter(Boolean).join(" ")}
    {...rest}
  >
    <span className={styles.label}>{label}</span>
    {count === null || count === undefined ? null : <span className={styles.count}>{count}</span>}
  </button>
)
