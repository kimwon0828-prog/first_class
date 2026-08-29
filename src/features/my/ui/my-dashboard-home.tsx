import Link from "next/link"

import type { MyDashboardData, TrialApplicationSummary } from "@/shared/lib/db/adapter"
import styles from "./my-dashboard-home.module.css"

type MyDashboardHomeProps = {
  profileName: string
  profilePhone: string | null
  dashboard: MyDashboardData
  nextUpcomingApplication: TrialApplicationSummary | null
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
  const hours = date.getHours()
  const minutes = `${date.getMinutes()}`.padStart(2, "0")
  const meridiem = hours < 12 ? "오전" : "오후"
  const displayHour = hours % 12 || 12

  return `${date.getMonth() + 1}월 ${date.getDate()}일 (${weekdays[date.getDay()]}) ${meridiem} ${displayHour}:${minutes}`
}

const resolveActiveCount = (dashboard: MyDashboardData) =>
  dashboard.newApplicationCount + dashboard.reviewingApplicationCount + dashboard.confirmedApplicationCount

export const MyDashboardHome = ({
  profileName,
  profilePhone,
  dashboard,
  nextUpcomingApplication
}: MyDashboardHomeProps) => {
  const greetingName = profileName.trim() || "학부모"
  // 선생님 이름은 학부모 화면에 노출하지 않는다.
  const academyName = nextUpcomingApplication?.academyName?.trim() || null

  return (
    <section className={styles.stack}>
      <section className={styles.greetingSection}>
        <h1 className={styles.greetingName}>{greetingName}님</h1>
        <p className={styles.greetingPhone}>{profilePhone?.trim() || "연락처 미입력"}</p>
      </section>

      <section className={styles.statsGrid} aria-label="요약">
        <a href="/my/applications" className={styles.statCard} aria-label="신청 중 내역 보기">
          <p className={styles.statLabel}>신청 중</p>
          <strong className={styles.statValue}>{resolveActiveCount(dashboard)}</strong>
        </a>
        <a href="/my/children" className={styles.statCard} aria-label="등록 자녀 관리하기">
          <p className={styles.statLabel}>등록 자녀</p>
          <strong className={styles.statValue}>{dashboard.childrenCount}</strong>
        </a>
      </section>

      <section className={styles.sectionBlock}>
        <header className={styles.sectionHeaderRow}>
          <h2 className={styles.sectionTitle}>다음 체험</h2>
          <Link href="/my/applications" className={styles.moreLink} prefetch={false}>
            전체 보기
          </Link>
        </header>

        {nextUpcomingApplication ? (
          <article className={styles.nextCard}>
            <p className={styles.nextTime}>{formatDateTime(nextUpcomingApplication.confirmedSlotAt ?? "")}</p>
            <h3 className={styles.nextTitle}>{nextUpcomingApplication.classTitle ?? "수업 정보 없음"}</h3>
            <p className={styles.nextMeta}>{academyName ?? "학원 정보 준비 중"}</p>
            <div className={styles.nextActionRow}>
              <Link href="/my/applications" className={styles.nextLink}>
                자세히
              </Link>
            </div>
          </article>
        ) : (
          <div className={styles.emptyBlock}>
            <p className={styles.emptyText}>예정된 체험이 없어요</p>
            <Link href="/classes" className={styles.primaryButton}>
              수업 둘러보기
            </Link>
          </div>
        )}
      </section>

      <section className={styles.menuGroup}>
        <Link href="/my/applications" className={styles.menuItem}>
          <span>내 신청</span>
          <span className={styles.menuChevron} aria-hidden="true">
            &gt;
          </span>
        </Link>
        <Link href="/favorites" className={styles.menuItem}>
          <span>관심 수업</span>
          <span className={styles.menuChevron} aria-hidden="true">
            &gt;
          </span>
        </Link>
        <Link href="/my/children" className={styles.menuItem}>
          <span>자녀 관리</span>
          <span className={styles.menuChevron} aria-hidden="true">
            &gt;
          </span>
        </Link>
      </section>

      <section className={styles.menuGroup}>
        <Link href="/my/profile" className={styles.menuItem}>
          <span>내 정보 수정</span>
          <span className={styles.menuChevron} aria-hidden="true">
            &gt;
          </span>
        </Link>
      </section>

      <section className={styles.menuGroup}>
        <Link href="/terms" className={styles.menuItem}>
          <span>이용약관</span>
          <span className={styles.menuChevron} aria-hidden="true">
            &gt;
          </span>
        </Link>
        <Link href="/privacy" className={styles.menuItem}>
          <span>개인정보처리방침</span>
          <span className={styles.menuChevron} aria-hidden="true">
            &gt;
          </span>
        </Link>
      </section>

      <section className={styles.menuGroup}>
        <form method="post" action="/auth/sign-out">
          <button type="submit" className={styles.menuButton}>
            로그아웃
          </button>
        </form>
      </section>
    </section>
  )
}
