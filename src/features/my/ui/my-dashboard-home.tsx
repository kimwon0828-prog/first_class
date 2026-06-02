import Link from "next/link"

import { ParentProfileForm } from "@/features/my/ui/parent-profile-form"
import type { MyDashboardData, TrialApplicationSummary } from "@/shared/lib/db/adapter"
import styles from "./my-dashboard-home.module.css"

type MyDashboardHomeProps = {
  profileName: string
  profilePhone: string | null
  dashboard: MyDashboardData
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return "-"
  }

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  })
}

const formatProgramType = (value: TrialApplicationSummary["classProgramType"]) => {
  if (value === "level_test") {
    return "레벨테스트"
  }

  return "체험수업"
}

const statusLabelMap: Record<TrialApplicationSummary["status"], string> = {
  new: "신청 완료",
  reviewing: "상담 대기",
  confirmed: "수업 확정",
  completed: "수업 완료",
  canceled: "신청 취소"
}

const resolveActiveCount = (dashboard: MyDashboardData) =>
  dashboard.newApplicationCount + dashboard.reviewingApplicationCount + dashboard.confirmedApplicationCount

const resolveDoneCount = (dashboard: MyDashboardData) =>
  dashboard.completedApplicationCount + dashboard.canceledApplicationCount

export const MyDashboardHome = ({
  profileName,
  profilePhone,
  dashboard
}: MyDashboardHomeProps) => {
  return (
    <section className={styles.stack}>
      <section className={styles.greetingCard}>
        <h2 className={styles.greetingTitle}>{profileName}님, 안녕하세요</h2>
        <p className={styles.greetingDesc}>신청 현황과 자녀 정보를 한 번에 확인할 수 있어요.</p>
        <p className={styles.greetingDesc}>
          자녀 정보를 미리 등록해두면 신청할 때 더 편리해요.
        </p>
      </section>

      <section className={styles.statsGrid} aria-label="요약">
        <article className={styles.statCard}>
          <p className={styles.statLabel}>전체 신청</p>
          <strong className={styles.statValue}>{dashboard.totalApplicationCount}</strong>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>등록 자녀</p>
          <strong className={styles.statValue}>{dashboard.childrenCount}</strong>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>진행 중</p>
          <strong className={styles.statValue}>{resolveActiveCount(dashboard)}</strong>
        </article>
        <article className={styles.statCard}>
          <p className={styles.statLabel}>완료/취소</p>
          <strong className={styles.statValue}>{resolveDoneCount(dashboard)}</strong>
        </article>
      </section>

      <section className={styles.menuCard} aria-label="빠른 메뉴">
        <MenuItem
          href="/my/children"
          title="자녀 관리"
          description="아이 정보를 등록하고 수정해요."
        />
        <Divider />
        <MenuItem
          href="/my/applications"
          title="신청 내역"
          description="신청한 첫수업 진행 상태를 확인해요."
        />
      </section>

      <section className={styles.accountCard}>
        <header className={styles.sectionHeader}>
          <h3 className={styles.sectionTitle}>계정 정보</h3>
          <p className={styles.sectionDesc}>
            저장한 보호자명과 연락처는 다음 신청 폼의 기본값으로 사용됩니다.
          </p>
        </header>
        <ParentProfileForm initialName={profileName} initialPhone={profilePhone} />
      </section>

      <section className={styles.recentCard}>
        <header className={styles.sectionHeaderRow}>
          <div>
            <h3 className={styles.sectionTitle}>최근 신청 내역</h3>
            <p className={styles.sectionDesc}>최근 신청한 첫수업을 확인해보세요.</p>
          </div>
          <Link href="/my/applications" className={styles.moreLink}>
            전체 보기
          </Link>
        </header>

        {dashboard.recentApplications.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>아직 신청한 내역이 없습니다.</p>
            <Link href="/classes" className={styles.moreLink}>
              수업 보러가기
            </Link>
          </div>
        ) : (
          <div className={styles.recentList}>
            {dashboard.recentApplications.map((item) => (
              <article key={item.id} className={styles.recentItem}>
                <div className={styles.recentTop}>
                  <div className={styles.recentTitle}>
                    {item.classTitle ?? "프로그램 정보 없음"}
                  </div>
                  <span className={`${styles.badge} ${styles[`badge_${item.status}`]}`}>
                    {statusLabelMap[item.status]}
                  </span>
                </div>

                <div className={styles.kvGrid}>
                  <div className={styles.kvRow}>
                    <span className={styles.kvLabel}>유형</span>
                    <span className={styles.kvValue}>{formatProgramType(item.classProgramType)}</span>
                  </div>
                  <div className={styles.kvRow}>
                    <span className={styles.kvLabel}>학생명</span>
                    <span className={styles.kvValue}>{item.childName}</span>
                  </div>
                  <div className={styles.kvRow}>
                    <span className={styles.kvLabel}>예약 시간</span>
                    <span className={styles.kvValue}>{formatDateTime(item.requestedSlotAt)}</span>
                  </div>
                  <div className={styles.kvRow}>
                    <span className={styles.kvLabel}>신청일</span>
                    <span className={styles.kvValue}>{formatDateTime(item.createdAt)}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  )
}

type MenuItemProps = {
  href: string
  title: string
  description: string
  badge?: string
  disabled?: boolean
}

const MenuItem = ({ href, title, description, badge, disabled }: MenuItemProps) => {
  const content = (
    <>
      <div className={styles.menuIcon} aria-hidden="true" />
      <div className={styles.menuMain}>
        <div className={styles.menuTitleRow}>
          <div className={styles.menuTitle}>{title}</div>
          {badge ? <span className={styles.menuBadge}>{badge}</span> : null}
        </div>
        <div className={styles.menuDesc}>{description}</div>
      </div>
      <div className={styles.menuChevron} aria-hidden="true" />
    </>
  )

  if (disabled) {
    return (
      <div className={`${styles.menuItem} ${styles.menuItemDisabled}`} aria-disabled="true">
        {content}
      </div>
    )
  }

  return (
    <Link href={href} className={styles.menuItem}>
      {content}
    </Link>
  )
}

const Divider = () => <div className={styles.divider} aria-hidden="true" />
