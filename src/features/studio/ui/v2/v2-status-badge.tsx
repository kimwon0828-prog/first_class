import type { ReactNode } from "react"

import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"

import styles from "./v2-status-badge.module.css"

type V2StatusBadgeProps = {
  tone: StudioStatusTone
  children: ReactNode
}

/**
 * Studio/StatusBadge v2 (Figma 2002:100).
 *
 * 표현만 담당한다. 어떤 상태가 어떤 tone 인지는 기존과 같이 application-status-labels 가 정한다 —
 * 라벨과 tone 판정을 v2 로 옮기면서 다시 만들지 않는다.
 */
export const V2StatusBadge = ({ tone, children }: V2StatusBadgeProps) => (
  <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>
)
