import Link from "next/link"

import {
  STUDIO_DONUT_RADIUS,
  STUDIO_DONUT_STROKE,
  STUDIO_DONUT_VIEWBOX,
  buildStudioDashboardAnalytics
} from "@/features/studio/lib/studio-dashboard-analytics"
import { buildStudioDashboardMetrics } from "@/features/studio/lib/studio-dashboard-metrics"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  buildStudioDashboardView,
  type StudioDashboardScheduleItem
} from "@/features/studio/lib/studio-dashboard-view"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioDashboardPeriodControl } from "@/features/studio/ui/studio-dashboard-period-control"
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"

import styles from "./page.module.css"

type StudioIndexPageProps = {
  searchParams?: Promise<{ preset?: string; startDate?: string; endDate?: string }>
}

/* donut segment 색은 semantic 역할로 고른다. brand green 이 아니라 success green 이다. */
const DONUT_SEGMENT_CLASS: Record<string, string> = {
  enrolled: styles.donutEnrolled,
  not_enrolled: styles.donutNotEnrolled,
  pending: styles.donutPending
}

export default async function StudioIndexPage({ searchParams }: StudioIndexPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedDateRange = resolveStudioDateRange({
    preset: resolvedSearchParams?.preset,
    startDate: resolvedSearchParams?.startDate,
    endDate: resolvedSearchParams?.endDate
  })
  // /studio/schedule 과 같은 한 번의 조회다. 세 영역 모두 이 결과에서 파생한다.
  const { data: applications, error } = await getStudioApplications(teacher.organizationId)
  const view = buildStudioDashboardView(applications)
  // 기간 필터는 같은 조회 결과에서 performance cohort 만 고른다. Action 영역에는 적용하지 않는다.
  const metrics = buildStudioDashboardMetrics(applications, selectedDateRange)
  const analytics = buildStudioDashboardAnalytics(metrics)
  const donutCenter = STUDIO_DONUT_VIEWBOX / 2

  const scheduleTitle = view.scheduleMode === "today" ? "오늘 체험 일정" : "다가오는 체험 일정"

  const renderScheduleRow = (item: StudioDashboardScheduleItem) => (
    <li key={item.id} className={styles.row}>
      <Link href={item.href} className={styles.rowLink}>
        <span className={styles.rowTime}>
          <strong className={styles.rowTimeValue}>{item.timeLabel}</strong>
          {item.dateLabel ? <span className={styles.rowTimeDate}>{item.dateLabel}</span> : null}
        </span>

        <span className={styles.rowBody}>
          <span className={styles.rowTitle}>{item.studentName}</span>
          <span className={styles.rowMeta}>
            {item.classTitle}
            {item.teacherName ? ` · ${item.teacherName}` : " · 담당 미배정"}
          </span>
        </span>

        <StudioStatusBadge tone={item.statusTone}>{item.statusLabel}</StudioStatusBadge>
      </Link>
    </li>
  )

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>대시보드</h1>
        <p className={styles.subtitle}>
          {view.todayLabel} · 지금 확인할 신청과 오늘의 체험 일정을 한눈에 확인하세요.
        </p>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : (
        <>
          <section className={styles.analytics} aria-labelledby="dashboard-analytics-title">
            <header className={styles.analyticsHead}>
              <div className={styles.analyticsHeading}>
                <h2 className={styles.analyticsTitle} id="dashboard-analytics-title">
                  성과 분석
                </h2>
                <p className={styles.analyticsDescription}>
                  {metrics.periodLabel} · 접수된 신청 기준입니다.
                </p>
              </div>

              <StudioDashboardPeriodControl selectedRange={selectedDateRange} />
            </header>

            <div className={styles.kpiRow}>
              {analytics.kpiCards.map((card) => (
                <article key={card.key} className={styles.kpiCard}>
                  <p className={styles.kpiLabel}>{card.label}</p>
                  <strong className={styles.kpiValue}>{card.value}</strong>
                  <p className={styles.kpiContext}>{card.context}</p>
                </article>
              ))}
            </div>

            <div className={styles.chartRow}>
              <article className={styles.chartCard} aria-labelledby="dashboard-stage-title">
                <div className={styles.chartHead}>
                  <h3 className={styles.chartTitle} id="dashboard-stage-title">
                    상담 → 등록 단계
                  </h3>
                  <p className={styles.chartDescription}>
                    선택 기간 신청의 단계별 도달 현황
                  </p>
                </div>

                {analytics.hasCohort ? (
                  <ul className={styles.barList}>
                    {analytics.stageBars.map((bar) => (
                      <li key={bar.key} className={styles.barRow}>
                        <span className={styles.barLabel}>{bar.label}</span>
                        <span className={styles.barTrack}>
                          <span
                            className={styles.barFill}
                            style={{ width: `${bar.fillPercent}%` }}
                          />
                        </span>
                        <span className={styles.barCount}>{bar.count}</span>
                        <span className={styles.barReached}>{bar.reachedLabel ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.chartEmpty}>선택 기간에 접수된 신청이 없습니다.</p>
                )}
              </article>

              <article className={styles.chartCard} aria-labelledby="dashboard-donut-title">
                <div className={styles.chartHead}>
                  <h3 className={styles.chartTitle} id="dashboard-donut-title">
                    등록 결과
                  </h3>
                  <p className={styles.chartDescription}>체험 완료 후 현재 등록 상태</p>
                </div>

                {analytics.hasDonutData ? (
                  <div className={styles.donutBody}>
                    <div className={styles.donutFigure}>
                      {/* 그림은 장식이다. 실제 정보는 아래 legend 가 텍스트로 전달한다. */}
                      <svg
                        className={styles.donut}
                        viewBox={`0 0 ${STUDIO_DONUT_VIEWBOX} ${STUDIO_DONUT_VIEWBOX}`}
                        aria-hidden="true"
                      >
                        <g transform={`rotate(-90 ${donutCenter} ${donutCenter})`}>
                          <circle
                            className={styles.donutTrack}
                            cx={donutCenter}
                            cy={donutCenter}
                            r={STUDIO_DONUT_RADIUS}
                            strokeWidth={STUDIO_DONUT_STROKE}
                          />
                          {analytics.donutSegments
                            .filter((segment) => segment.count > 0)
                            .map((segment) => (
                              <circle
                                key={segment.key}
                                className={`${styles.donutSegment} ${DONUT_SEGMENT_CLASS[segment.key]}`}
                                cx={donutCenter}
                                cy={donutCenter}
                                r={STUDIO_DONUT_RADIUS}
                                strokeWidth={STUDIO_DONUT_STROKE}
                                strokeDasharray={`${segment.dashLength} ${
                                  analytics.donutCircumference - segment.dashLength
                                }`}
                                strokeDashoffset={segment.dashOffset}
                              />
                            ))}
                        </g>
                      </svg>

                      <span className={styles.donutCenter}>
                        <span className={styles.donutCenterLabel}>체험 완료</span>
                        <strong className={styles.donutCenterValue}>{analytics.donutTotal}건</strong>
                      </span>
                    </div>

                    <ul className={styles.legend}>
                      {analytics.donutSegments.map((segment) => (
                        <li key={segment.key} className={styles.legendItem}>
                          <span
                            className={`${styles.legendDot} ${DONUT_SEGMENT_CLASS[segment.key]}`}
                            aria-hidden="true"
                          />
                          <span className={styles.legendLabel}>{segment.label}</span>
                          <span className={styles.legendValue}>{segment.count}건</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className={styles.chartEmpty}>아직 체험을 마친 신청이 없습니다.</p>
                )}

                <footer className={styles.conversionFoot}>
                  <span className={styles.conversionLabel}>등록 전환율</span>
                  <strong className={styles.conversionValue}>{analytics.conversionValue}</strong>
                  <span className={styles.conversionMeta}>{analytics.conversionMeta}</span>
                </footer>
              </article>
            </div>
          </section>

          <div className={styles.workspace}>
            <section className={styles.panel} aria-labelledby="dashboard-actions-title">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle} id="dashboard-actions-title">
                  지금 확인할 일
                </h2>
                {view.actionTotalCount > 0 ? (
                  <span className={styles.panelCount}>{view.actionTotalCount}건</span>
                ) : null}
                <Link href="/studio/cases" className={styles.panelAction}>
                  상담·등록에서 보기 →
                </Link>
              </div>

              {view.actionItems.length === 0 ? (
                <p className={styles.empty}>지금 확인이 필요한 신청이 없습니다.</p>
              ) : (
                <ul className={styles.list}>
                  {view.actionItems.map((item) => (
                    <li key={item.id} className={styles.row}>
                      <Link href={item.href} className={styles.rowLink}>
                        <span className={styles.rowBody}>
                          <span className={styles.rowTitle}>
                            {item.studentName}
                            <span className={styles.rowTitleSub}> · {item.studentGrade}</span>
                          </span>
                          <span className={styles.rowMeta}>{item.classTitle}</span>
                          <span className={styles.rowAction}>{item.actionLabel}</span>
                        </span>

                        <StudioStatusBadge tone={item.statusTone}>{item.statusLabel}</StudioStatusBadge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="dashboard-schedule-title">
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle} id="dashboard-schedule-title">
                  {scheduleTitle}
                </h2>
                {view.todayScheduleCount > 0 ? (
                  <span className={styles.panelCount}>{view.todayScheduleCount}건</span>
                ) : null}
                <Link href="/studio/schedule" className={styles.panelAction}>
                  일정 관리에서 보기 →
                </Link>
              </div>

              {view.scheduleItems.length === 0 ? (
                <p className={styles.empty}>예정된 체험 일정이 없습니다.</p>
              ) : (
                <ul className={styles.list}>{view.scheduleItems.map(renderScheduleRow)}</ul>
              )}
            </section>
          </div>

          <section className={styles.panelWide} aria-labelledby="dashboard-results-title">
            <div className={styles.panelHead}>
              <h2 className={styles.panelTitle} id="dashboard-results-title">
                최근 등록 완료
              </h2>
              <Link href="/studio/cases?view=closed" className={styles.panelAction}>
                완료·종료에서 보기 →
              </Link>
            </div>

            {view.recentRegistrationItems.length > 0 ? (
              <ul className={styles.list}>
                {view.recentRegistrationItems.map((item) => (
                  <li key={item.id} className={styles.row}>
                    <Link href={item.href} className={styles.rowLink}>
                      <span className={styles.rowBody}>
                        <span className={styles.rowTitle}>{item.studentName}</span>
                        <span className={styles.rowMeta}>
                          {item.classTitle}
                          {item.whenLabel ? ` · ${item.whenLabel}` : ""}
                        </span>
                      </span>

                      <StudioStatusBadge tone={item.outcomeTone}>{item.outcomeLabel}</StudioStatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>아직 등록 완료 기록이 없습니다.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
