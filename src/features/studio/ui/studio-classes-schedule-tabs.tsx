import Link from "next/link"

import styles from "./studio-classes-schedule-tabs.module.css"

type StudioClassesScheduleTabsProps = {
  active: "classes" | "schedule"
  /** host 에 맞춘 주소. 호출하는 server page 가 studio-navigation 으로 만들어 넘긴다. */
  classesHref: string
  scheduleHref: string
}

/**
 * 수업·일정 메뉴 안의 하위 탭: 수업(/studio/classes) | 전체 일정(/studio/schedule).
 *
 * 두 화면을 아직 한 화면으로 합치지 않았으므로(3단계) 탭은 기존 두 URL 을 오가는 링크다.
 * 화면 본문 · URL · 필터 동작은 바꾸지 않는다.
 */
export const StudioClassesScheduleTabs = ({ active, classesHref, scheduleHref }: StudioClassesScheduleTabsProps) => (
  <nav className={styles.tabs} aria-label="수업·일정 보기">
    <Link
      href={classesHref}
      prefetch={false}
      aria-current={active === "classes" ? "page" : undefined}
      className={active === "classes" ? `${styles.tab} ${styles.active}` : styles.tab}
    >
      수업
    </Link>
    <Link
      href={scheduleHref}
      prefetch={false}
      aria-current={active === "schedule" ? "page" : undefined}
      className={active === "schedule" ? `${styles.tab} ${styles.active}` : styles.tab}
    >
      전체 일정
    </Link>
  </nav>
)
