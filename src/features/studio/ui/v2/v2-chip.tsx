import type { ButtonHTMLAttributes, ReactNode } from "react"

import styles from "./v2-chip.module.css"

type V2ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & {
  label: ReactNode
  /** 라벨 옆 건수. 없으면 표시하지 않는다. */
  count?: number | string | null
  selected?: boolean
  className?: string
}

/** 링크처럼 <button> 이 아닌 요소를 칩 모양으로 그릴 때 쓴다(신청 목록 필터는 주소를 바꾸는 링크다). */
export const v2ChipClassName = ({ selected = false, className }: { selected?: boolean; className?: string } = {}) =>
  [styles.chip, selected ? styles.selected : null, className].filter(Boolean).join(" ")

/** 칩 안 글자 · 건수 칸. v2ChipClassName 과 같이 쓴다. */
export const v2ChipPartClassName = { label: styles.label, count: styles.count }

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
