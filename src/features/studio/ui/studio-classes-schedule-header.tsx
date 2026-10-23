import Link from "next/link"

import { StudioClassesScheduleTabs } from "./studio-classes-schedule-tabs"
import { V2Button, v2ButtonClassName } from "./v2/v2-button"
import { V2PlusIcon } from "./v2/v2-icons"
import styles from "./studio-classes-schedule-header.module.css"

type StudioClassesScheduleHeaderProps = {
  active: "classes" | "schedule"
  description: string
  /** host 에 맞춘 주소. */
  classesHref: string
  scheduleHref: string
  newClassHref: string
  onOpenBookingTimes: () => void
}

/**
 * 수업·일정 두 탭이 같이 쓰는 머리(Figma 2148:6043 · 2178:144).
 * 제목 · 설명 → [예약 시간 관리](outline) [수업 등록](primary) → 하위 탭.
 */
export const StudioClassesScheduleHeader = ({
  active,
  description,
  classesHref,
  scheduleHref,
  newClassHref,
  onOpenBookingTimes
}: StudioClassesScheduleHeaderProps) => (
  <div className={styles.head}>
    <header className={styles.header}>
      <div className={styles.titleBox}>
        <h1 className={styles.title}>수업·일정</h1>
        <p className={styles.description}>{description}</p>
      </div>
      <V2Button variant="outline" onClick={onOpenBookingTimes}>
        예약 시간 관리
      </V2Button>
      <Link href={newClassHref} prefetch={false} className={v2ButtonClassName({ variant: "primary" })}>
        <V2PlusIcon size={18} />
        수업 등록
      </Link>
    </header>
    <StudioClassesScheduleTabs active={active} classesHref={classesHref} scheduleHref={scheduleHref} />
  </div>
)
