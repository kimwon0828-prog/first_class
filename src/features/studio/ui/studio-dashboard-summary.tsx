"use client"

import Link from "next/link"
import { useState } from "react"

import type { StudioApplicationSummary, StudioDashboardSummary } from "@/shared/lib/db/adapter"
import styles from "@/features/studio/ui/studio-dashboard.module.css"

type StudioDashboardSummaryProps = {
  summary: StudioDashboardSummary
  applications: StudioApplicationSummary[]
  applicationsError?: string | null
  applicationsHref?: string
  selectedRangeLabel?: string
  selectedTeacherName?: string | null
}

type DashboardApplicationLinkStatus = "new" | "completed"

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

const getProgramTypeLabel = (application: StudioApplicationSummary) => {
  if (application.classProgramType === "level_test") {
    return "레벨테스트"
  }
  return "체험수업"
}

const isNoShowApplication = (application: StudioApplicationSummary) =>
  application.status === "canceled" && Boolean(application.noShowAt)

const getPrimaryStatusBadge = (application: StudioApplicationSummary) => {
  if (application.status === "new") {
    return { label: "신규 신청", tone: "successSoft" as const }
  }

  if (application.status === "reviewing") {
    return { label: "상담 대기", tone: "warningSoft" as const }
  }

  if (application.status === "confirmed") {
    return { label: "수업 확정", tone: "infoSoft" as const }
  }

  if (isNoShowApplication(application)) {
    return { label: "노쇼", tone: "neutralSoft" as const }
  }

  if (application.status === "completed") {
    return { label: "체험 완료", tone: "darkSoft" as const }
  }

  return { label: "신청 취소", tone: "dangerSoft" as const }
}

const getSecondaryBadge = (application: StudioApplicationSummary) => {
  if (application.registrationStatus === "enrolled") {
    return { label: "등록 완료", tone: "successSolid" as const }
  }

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
    | "darkSoft"
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

  if (application.status === "confirmed") {
    return 3
  }

  return 99
}

const buildApplicationsHref = (
  baseHref: string,
  status?: DashboardApplicationLinkStatus
) => {
  const [pathname, search = ""] = baseHref.split("?")
  const params = new URLSearchParams(search)

  if (status) {
    params.set("status", status)
  } else {
    params.delete("status")
  }

  const query = params.toString()
  return query ? `${pathname}?${query}` : pathname
}

export const StudioDashboardSummaryView = ({
  summary,
  applications,
  applicationsError,
  applicationsHref = "/studio/applications",
  selectedRangeLabel = "이번 달",
  selectedTeacherName = null
}: StudioDashboardSummaryProps) => {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null)
  const newApplicationsHref = buildApplicationsHref(applicationsHref, "new")
  const completedApplicationsHref = buildApplicationsHref(applicationsHref, "completed")
  const queueItems = [...applications]
    .filter((item) => item.status === "new" || item.status === "reviewing" || item.status === "confirmed")
    .sort((a, b) => {
      const rankDelta = getPriorityRank(a) - getPriorityRank(b)
      if (rankDelta !== 0) {
        return rankDelta
      }

      return (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
    })
    .slice(0, 4)

  const recentItems = applications.slice(0, 5)
  const conversionGaugeWidth =
    summary.enrollmentRate != null ? `${Math.max(0, Math.min(100, summary.enrollmentRate))}%` : "0%"

  const metricItems = [
    {
      key: "total",
      label: "전체 신청",
      value: String(summary.totalApplicationCount),
      description: selectedRangeLabel
    },
    {
      key: "confirmed",
      label: "수업 확정",
      value: String(summary.confirmedCount),
      description: "상담 완료"
    },
    {
      key: "registered",
      label: "등록 완료",
      value: String(summary.registeredCount),
      description: "확정 → 등록"
    },
    {
      key: "canceled",
      label: "노쇼·취소",
      value: String(summary.canceledOrNoShowCount),
      description: selectedRangeLabel
    }
  ]

  const actionZoneEmpty = summary.actionableCount === 0

  return (
    <div className={styles.dashboard}>
      {applicationsError ? (
        <section className={styles.alertDanger}>
          <p className={styles.alertText}>{applicationsError}</p>
        </section>
      ) : null}

      <section className={styles.section}>
        <header className={styles.sectionHeaderRow}>
          <div className={styles.sectionTitleGroup}>
            <div className={styles.sectionTitleRow}>
              <h2 className={styles.sectionTitle}>지금 처리할 일</h2>
              {summary.actionableCount > 0 ? <span className={styles.pulseDot} aria-hidden="true" /> : null}
            </div>
            <p className={styles.sectionDescription}>
              확인이 늦어지면 학부모가 다른 학원으로 가요. 빠른 응답이 등록으로 이어져요.
            </p>
          </div>
        </header>

        {actionZoneEmpty ? (
          <div className={styles.emptyActionCard}>
            <p className={styles.emptyTitle}>지금 처리할 신청이 없어요.</p>
            <p className={styles.emptyDescription}>새 신청이 오면 문자로 알려드릴게요.</p>
          </div>
        ) : (
          <div className={styles.actionZoneGrid}>
            <article className={`${styles.actionCard} ${styles.actionCardPrimary}`}>
              <div className={styles.actionCardHeader}>
                <p className={styles.actionLabel}>새 신청</p>
              </div>
              <p className={styles.actionValue}>{summary.newApplicationCount}</p>
              <p className={styles.actionDescription}>아직 확인 안 한 신청이에요.</p>
              <Link
                href={newApplicationsHref}
                className={styles.actionButtonSolid}
                aria-busy={pendingTarget === "action-new"}
                onClick={() => setPendingTarget("action-new")}
              >
                {pendingTarget === "action-new" ? "이동 중..." : "확인하러 가기"}
              </Link>
            </article>

            <article className={`${styles.actionCard} ${styles.actionCardOutline}`}>
              <div className={styles.actionCardHeader}>
                <p className={styles.actionLabel}>등록 확인 필요</p>
              </div>
              <p className={`${styles.actionValue} ${styles.actionValueAmber}`}>
                {summary.needsRegistrationConfirmationCount}
              </p>
              <p className={styles.actionDescription}>체험은 끝났지만 등록 여부가 아직 기록되지 않았어요.</p>
              <Link
                href={completedApplicationsHref}
                className={styles.actionButtonOutline}
                aria-busy={pendingTarget === "action-completed"}
                onClick={() => setPendingTarget("action-completed")}
              >
                {pendingTarget === "action-completed" ? "이동 중..." : "등록 확인하기"}
              </Link>
            </article>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.metricStrip}>
          {metricItems.map((item) => (
            <article key={item.key} className={styles.metricStripItem}>
              <p className={styles.metricStripLabel}>{item.label}</p>
              <p className={styles.metricStripValue}>{item.value}</p>
              <p className={styles.metricStripDescription}>{item.description}</p>
            </article>
          ))}

          <article className={`${styles.metricStripItem} ${styles.metricStripHighlight}`}>
            <p className={styles.metricStripLabel}>등록 전환율</p>
            <p className={styles.metricStripValue}>
              {summary.enrollmentRate != null ? `${summary.enrollmentRate}%` : "—"}
            </p>
            <p className={styles.metricStripDescription}>
              {summary.enrollmentRate != null
                ? `등록 ${summary.enrollmentRateNumerator} / 완료 ${summary.enrollmentRateDenominator}`
                : "아직 집계할 체험이 없어요"}
            </p>
            <div className={styles.metricGauge} aria-hidden="true">
              <span className={styles.metricGaugeFill} style={{ width: conversionGaugeWidth }} />
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <header className={styles.sectionHeaderRow}>
          <div className={styles.sectionTitleGroup}>
            <h2 className={styles.sectionTitle}>우선 처리 큐</h2>
            <p className={styles.sectionDescription}>
              신규 신청부터 확정 건까지, 바로 연락하거나 다음 단계로 넘길 신청을 먼저 보여줍니다.
            </p>
          </div>
        </header>

        {applicationsError ? null : queueItems.length === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>우선 처리할 신청이 없어요.</p>
            <p className={styles.emptyDescription}>새 신청이나 확정 일정이 생기면 이곳에서 먼저 확인할 수 있어요.</p>
          </div>
        ) : (
          <div className={styles.priorityQueueGrid}>
            {queueItems.map((item) => {
              const primaryBadge = getPrimaryStatusBadge(item)
              const secondaryBadge = getSecondaryBadge(item)
              const scheduleLabel = item.status === "confirmed" ? "확정 일정" : "희망 일정"
              const isNewCard = item.status === "new"
              const detailHref = `/studio/applications/${item.id}`
              return (
                <article
                  key={item.id}
                  className={`${styles.priorityCard} ${isNewCard ? styles.priorityCardNew : ""}`}
                >
                  <div className={styles.priorityCardTop}>
                    <div>
                      <strong className={styles.priorityTitle}>
                        {item.childName}
                        <span className={styles.priorityTitleSub}> · {item.childGrade}</span>
                      </strong>
                      <p className={styles.priorityClassTitle}>
                        {getProgramTypeLabel(item)} · {item.classTitle ?? "-"}
                      </p>
                    </div>
                    <div className={styles.badgeRow}>
                      <Badge label={primaryBadge.label} tone={primaryBadge.tone} />
                      {secondaryBadge ? <Badge label={secondaryBadge.label} tone={secondaryBadge.tone} /> : null}
                    </div>
                  </div>

                  <dl className={styles.priorityMetaGrid}>
                    <div className={styles.priorityMetaItem}>
                      <dt className={styles.priorityMetaLabel}>{scheduleLabel}</dt>
                      <dd className={styles.priorityMetaValue}>{formatDateTime(getScheduledAt(item))}</dd>
                    </div>
                    <div className={styles.priorityMetaItem}>
                      <dt className={styles.priorityMetaLabel}>보호자 연락처</dt>
                      <dd className={styles.priorityMetaValue}>{item.parentPhone ?? "-"}</dd>
                    </div>
                  </dl>

                  <div className={styles.priorityActions}>
                    <Link
                      href={detailHref}
                      className={styles.actionButtonPrimary}
                      aria-busy={
                        pendingTarget ===
                        (item.status === "new"
                          ? `${item.id}-detail`
                          : item.status === "confirmed"
                            ? `${item.id}-memo`
                            : `${item.id}-continue`)
                      }
                      onClick={() =>
                        setPendingTarget(
                          item.status === "new"
                            ? `${item.id}-detail`
                            : item.status === "confirmed"
                              ? `${item.id}-memo`
                              : `${item.id}-continue`
                        )
                      }
                    >
                      {pendingTarget ===
                      (item.status === "new"
                        ? `${item.id}-detail`
                        : item.status === "confirmed"
                          ? `${item.id}-memo`
                          : `${item.id}-continue`)
                        ? "이동 중..."
                        : item.status === "new"
                          ? "상세 보기"
                          : item.status === "confirmed"
                            ? "운영 메모"
                            : "이어서 처리"}
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
          <div className={styles.sectionTitleGroup}>
            <h2 className={styles.sectionTitle}>최근 신청 현황</h2>
            <p className={styles.sectionDescription}>
              {selectedRangeLabel}
              {selectedTeacherName ? ` · ${selectedTeacherName}` : ""} 기준 최근 신청 5건을 요약해 보여줍니다.
            </p>
          </div>
          <Link
            href={applicationsHref}
            className={styles.linkButtonGhost}
            aria-busy={pendingTarget === "applications"}
            onClick={() => setPendingTarget("applications")}
          >
            {pendingTarget === "applications" ? "이동 중..." : "신청함 전체 보기 →"}
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
                    const primaryBadge = getPrimaryStatusBadge(item)
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
                          <Link
                            href={`/studio/applications/${item.id}`}
                            className={styles.buttonSecondarySm}
                            aria-busy={pendingTarget === item.id}
                            onClick={() => setPendingTarget(item.id)}
                          >
                            {pendingTarget === item.id ? "이동 중..." : "관리"}
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
                const primaryBadge = getPrimaryStatusBadge(item)
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
                      <Link
                        href={`/studio/applications/${item.id}`}
                        className={styles.buttonSecondary}
                        aria-busy={pendingTarget === item.id}
                        onClick={() => setPendingTarget(item.id)}
                      >
                        {pendingTarget === item.id ? "이동 중..." : "관리"}
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </section>

    </div>
  )
}
