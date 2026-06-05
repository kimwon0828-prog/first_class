import Link from "next/link"

import type { StudioApplicationSummary, StudioDashboardSummary } from "@/shared/lib/db/adapter"
import styles from "@/features/studio/ui/studio-dashboard.module.css"

type StudioDashboardSummaryProps = {
  summary: StudioDashboardSummary
  applications: StudioApplicationSummary[]
  applicationsError?: string | null
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-"
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value))
}

const getScheduledAt = (application: StudioApplicationSummary) =>
  application.confirmedSlotAt ?? application.requestedSlotAt

const getStatusBadge = (application: StudioApplicationSummary) => {
  if (application.registrationStatus === "enrolled") {
    return { label: "등록 완료", tone: "successSolid" as const }
  }

  if (application.status === "new") {
    return { label: "신규 신청", tone: "successSoft" as const }
  }

  if (application.status === "reviewing") {
    return { label: "상담 대기", tone: "warningSoft" as const }
  }

  if (application.status === "confirmed") {
    return { label: "수업 확정", tone: "infoSoft" as const }
  }

  if (application.status === "completed") {
    return { label: "수업 완료", tone: "neutralSoft" as const }
  }

  return { label: "신청 취소", tone: "dangerSoft" as const }
}

const getSecondaryBadge = (application: StudioApplicationSummary) => {
  if (application.registrationStatus === "pending") {
    return { label: "등록 보류", tone: "warningSoft" as const }
  }

  if (application.registrationStatus === "not_enrolled") {
    return { label: "미등록", tone: "neutralSoft" as const }
  }

  if (application.status === "completed" && application.registrationStatus === "undecided") {
    return { label: "등록 미정", tone: "neutralSoft" as const }
  }

  return null
}

const Badge = ({
  label,
  tone
}: {
  label: string
  tone:
    | "successSoft"
    | "warningSoft"
    | "infoSoft"
    | "neutralSoft"
    | "dangerSoft"
    | "darkSolid"
    | "successSolid"
}) => {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{label}</span>
}

const getPriorityRank = (application: StudioApplicationSummary) => {
  if (application.status === "new") {
    return 1
  }

  if (application.status === "reviewing") {
    return 2
  }

  if (
    application.status === "completed" &&
    (application.registrationStatus === "undecided" || application.registrationStatus === "pending")
  ) {
    return 3
  }

  if (application.status === "confirmed") {
    return 4
  }

  return 99
}

export const StudioDashboardSummaryView = ({
  summary,
  applications,
  applicationsError
}: StudioDashboardSummaryProps) => {
  const totalApplications = applications.length

  const metricCards = [
    {
      key: "total",
      label: "전체 신청",
      value: totalApplications,
      description: "선택한 조건 기준 전체 신청 수"
    },
    {
      key: "new",
      label: "신규 신청",
      value: summary.newApplicationCount,
      description: "확인이 필요한 신규 신청"
    },
    {
      key: "pending",
      label: "상담 대기",
      value: summary.pendingConfirmationCount,
      description: "상담/확정 전 상태"
    },
    {
      key: "registered",
      label: "등록 완료",
      value: summary.registeredCount,
      description: "등록 처리 완료 건수"
    },
    {
      key: "conversion",
      label: "등록전환율",
      value: `${summary.enrollmentRate}%`,
      description: "등록 완료 / 전체 신청"
    }
  ] as const

  const todayCheckItems = [...applications]
    .filter((item) => item.status !== "canceled")
    .sort((a, b) => {
      const rankDelta = getPriorityRank(a) - getPriorityRank(b)
      if (rankDelta !== 0) {
        return rankDelta
      }

      return (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? "")
    })
    .slice(0, 4)

  const recentItems = applications.slice(0, 5)

  const quickLinks = [
    {
      href: "/studio/applications",
      title: "신청/상담 관리",
      description: "신규 신청과 상담 상태를 관리해요."
    },
    {
      href: "/studio/classes",
      title: "수업 관리",
      description: "수업 공개 상태와 담당 선생님을 관리해요."
    },
    {
      href: "/studio/schedule",
      title: "일정 관리",
      description: "예약 가능 시간과 blocked 상태를 관리해요."
    },
    {
      href: "/studio/teachers",
      title: "선생님 관리",
      description: "내부 선생님 프로필과 active 상태를 관리해요."
    }
  ] as const

  return (
    <div className={styles.dashboard}>
      {applicationsError ? (
        <section className={styles.alertDanger}>
          <p className={styles.alertText}>{applicationsError}</p>
        </section>
      ) : null}

      <section className={styles.metricGrid} aria-label="핵심 지표">
        {metricCards.map((card) => (
          <div key={card.key} className={styles.metricCard}>
            <div className={styles.metricTop}>
              <p className={styles.metricLabel}>{card.label}</p>
              <span className={styles.metricAccent} />
            </div>
            <p className={styles.metricValue}>{card.value}</p>
            <p className={styles.metricDescription}>{card.description}</p>
          </div>
        ))}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>오늘 확인할 신청</h2>
          <p className={styles.sectionDescription}>우선 처리해야 할 신청을 빠르게 확인하세요.</p>
        </header>

        {applicationsError ? null : todayCheckItems.length === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>오늘 확인할 신청이 없어요.</p>
            <p className={styles.emptyDescription}>새로운 신청이 들어오면 이곳에서 우선 확인할 수 있어요.</p>
          </div>
        ) : (
          <div className={styles.listGrid}>
            {todayCheckItems.map((item) => {
              const primaryBadge = getStatusBadge(item)
              const secondaryBadge = getSecondaryBadge(item)
              return (
                <article key={item.id} className={styles.applicationCard}>
                  <div className={styles.applicationCardTop}>
                    <div className={styles.applicationCardTitleRow}>
                      <strong className={styles.applicationTitle}>
                        {item.childName} <span className={styles.applicationTitleSub}>· {item.childGrade}</span>
                      </strong>
                      <div className={styles.badgeRow}>
                        <Badge label={primaryBadge.label} tone={primaryBadge.tone} />
                        {secondaryBadge ? (
                          <Badge label={secondaryBadge.label} tone={secondaryBadge.tone} />
                        ) : null}
                      </div>
                    </div>
                    <p className={styles.applicationClassTitle}>{item.classTitle ?? "-"}</p>
                  </div>

                  <dl className={styles.applicationMeta}>
                    <div className={styles.applicationMetaRow}>
                      <dt className={styles.applicationMetaLabel}>희망 일정</dt>
                      <dd className={styles.applicationMetaValue}>{formatDateTime(getScheduledAt(item))}</dd>
                    </div>
                    <div className={styles.applicationMetaRow}>
                      <dt className={styles.applicationMetaLabel}>보호자 연락처</dt>
                      <dd className={styles.applicationMetaValue}>{item.parentPhone ?? "-"}</dd>
                    </div>
                  </dl>

                  <div className={styles.applicationActions}>
                    <Link href={`/studio/applications/${item.id}`} className={styles.buttonSecondary}>
                      관리
                    </Link>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeaderRow}>
          <div>
            <h2 className={styles.sectionTitle}>최근 신청 현황</h2>
            <p className={styles.sectionDescription}>최근 신청 5건을 요약해 보여줍니다.</p>
          </div>
          <Link href="/studio/applications" className={styles.buttonGhost}>
            신청함 전체 보기
          </Link>
        </header>

        {applicationsError ? null : recentItems.length === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>아직 신청 내역이 없어요.</p>
            <p className={styles.emptyDescription}>
              수업을 등록하면 신청 현황을 이곳에서 확인할 수 있어요.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.th}>신청일</th>
                    <th className={styles.th}>학생</th>
                    <th className={styles.th}>수업</th>
                    <th className={styles.th}>상태</th>
                    <th className={styles.th}>희망 일정</th>
                    <th className={styles.thRight}>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {recentItems.map((item) => {
                    const primaryBadge = getStatusBadge(item)
                    const secondaryBadge = getSecondaryBadge(item)
                    return (
                      <tr key={item.id} className={styles.tr}>
                        <td className={styles.td}>{formatDateTime(item.createdAt)}</td>
                        <td className={styles.td}>
                          {item.childName} <span className={styles.tdSub}>· {item.childGrade}</span>
                        </td>
                        <td className={styles.td}>{item.classTitle ?? "-"}</td>
                        <td className={styles.td}>
                          <div className={styles.badgeRow}>
                            <Badge label={primaryBadge.label} tone={primaryBadge.tone} />
                            {secondaryBadge ? (
                              <Badge label={secondaryBadge.label} tone={secondaryBadge.tone} />
                            ) : null}
                          </div>
                        </td>
                        <td className={styles.td}>{formatDateTime(getScheduledAt(item))}</td>
                        <td className={styles.tdRight}>
                          <Link href={`/studio/applications/${item.id}`} className={styles.buttonSecondarySm}>
                            관리
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.mobileList}>
              {recentItems.map((item) => {
                const primaryBadge = getStatusBadge(item)
                const secondaryBadge = getSecondaryBadge(item)
                return (
                  <article key={item.id} className={styles.mobileItem}>
                    <div className={styles.mobileItemTop}>
                      <p className={styles.mobileItemTitle}>
                        {item.childName} <span className={styles.mobileItemSub}>· {item.childGrade}</span>
                      </p>
                      <div className={styles.badgeRow}>
                        <Badge label={primaryBadge.label} tone={primaryBadge.tone} />
                        {secondaryBadge ? (
                          <Badge label={secondaryBadge.label} tone={secondaryBadge.tone} />
                        ) : null}
                      </div>
                    </div>
                    <p className={styles.mobileItemClassTitle}>{item.classTitle ?? "-"}</p>
                    <dl className={styles.mobileMeta}>
                      <div className={styles.mobileMetaRow}>
                        <dt className={styles.mobileMetaLabel}>신청일</dt>
                        <dd className={styles.mobileMetaValue}>{formatDateTime(item.createdAt)}</dd>
                      </div>
                      <div className={styles.mobileMetaRow}>
                        <dt className={styles.mobileMetaLabel}>희망 일정</dt>
                        <dd className={styles.mobileMetaValue}>{formatDateTime(getScheduledAt(item))}</dd>
                      </div>
                    </dl>
                    <div className={styles.mobileActions}>
                      <Link href={`/studio/applications/${item.id}`} className={styles.buttonSecondary}>
                        관리
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>빠른 메뉴</h2>
          <p className={styles.sectionDescription}>자주 사용하는 운영 메뉴로 바로 이동하세요.</p>
        </header>

        <div className={styles.quickGrid}>
          {quickLinks.map((item) => (
            <Link key={item.href} href={item.href} className={styles.quickCard}>
              <div className={styles.quickCardTop}>
                <span className={styles.quickIcon} aria-hidden="true" />
                <strong className={styles.quickTitle}>{item.title}</strong>
              </div>
              <p className={styles.quickDescription}>{item.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
