import type { ReactNode } from "react"

import type { StudioStatusTone } from "@/features/studio/lib/application-status-labels"

import styles from "./studio-status-badge.module.css"

const TONE_CLASS: Record<StudioStatusTone, string> = {
  green: styles.green,
  amber: styles.amber,
  blue: styles.blue,
  gray: styles.gray,
  red: styles.red
}

type StudioStatusBadgeProps = {
  tone: StudioStatusTone
  children: ReactNode
}

/**
 * 표현만 담당한다. 어떤 status 가 어떤 tone 인지는 application-status-labels 의
 * getStudioStatusTone / getStudioRegistrationStatusTone 이 결정한다.
 */
export const StudioStatusBadge = ({ tone, children }: StudioStatusBadgeProps) => (
  <span className={`${styles.badge} ${TONE_CLASS[tone]}`}>{children}</span>
)
