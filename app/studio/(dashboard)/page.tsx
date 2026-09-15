import Link from "next/link"

import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import {
  buildConversionInfographicFileName,
  buildConversionInfographicModel,
  buildConversionInfographicPeriodFileLabel
} from "@/features/reports/lib/conversion-infographic-model"
import { ConversionInfographicLauncher } from "@/features/reports/ui/conversion-infographic-launcher"
import { getStudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import {
  STUDIO_DONUT_RADIUS,
  STUDIO_DONUT_STROKE,
  STUDIO_DONUT_VIEWBOX,
  buildStudioDashboardAnalytics
} from "@/features/studio/lib/studio-dashboard-analytics"
import { buildStudioDashboardMetrics } from "@/features/studio/lib/studio-dashboard-metrics"
import {
  CONVERSION_MATRIX_COLUMN_LABELS,
  PARENT_DECISION_MATRIX_LABELS,
  formatConversionRate,
  formatRateFraction
} from "@/features/studio/lib/studio-conversion-analytics"
import { getStudioConversionAnalytics } from "@/features/studio/queries/get-studio-conversion-analytics"
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
  const { entitlements } = await getStudioEntitlementsForDisplay(teacher.organizationId)
  const view = buildStudioDashboardView(applications)
  // 전환 분석은 유료다. 권한이 없으면 집계 자체를 하지 않는다 —
  // 계산해 두고 렌더만 감추면 전환 수치가 서버 payload 에 그대로 실려 나간다.
  // 운영 영역(확인할 일 / 예정 체험)은 같은 조회 결과에서 그대로 만든다.
  const metrics = entitlements.canUseConversionAnalytics
    ? buildStudioDashboardMetrics(applications, selectedDateRange)
    : null
  const analytics = metrics ? buildStudioDashboardAnalytics(metrics) : null
  // 전환 현황도 같은 유료 권한이다. 권한이 없으면 조회 자체를 하지 않는다 —
  // 계산해 두고 렌더만 감추면 숫자가 서버 payload 로 그대로 나간다.
  const conversion = entitlements.canUseConversionAnalytics
    ? await getStudioConversionAnalytics(applications, selectedDateRange)
    : null
  const donutCenter = STUDIO_DONUT_VIEWBOX / 2

  // 공유용 리포트는 위에서 만든 지표를 그대로 다시 그린다. 숫자를 새로 세지 않는다.
  // 유료 권한이 없으면 지표 자체가 없으므로 리포트도 만들지 않는다.
  let infographicModel = null
  let infographicFileName: string | null = null
  if (metrics && analytics) {
    let academyName = teacher.name?.trim() || "우리 학원"
    try {
      const organization = await getStudioSettingsOrganization(teacher)
      academyName =
        [organization?.name?.trim(), organization?.branchName?.trim()]
          .filter((value): value is string => Boolean(value))
          .join(" ") || academyName
    } catch {
      // 학원 이름은 표시용이다. 못 읽어도 리포트는 만든다.
    }

    infographicModel = buildConversionInfographicModel({
      organizationName: academyName,
      metrics,
      analytics,
      generatedAt: new Date()
    })
    infographicFileName = buildConversionInfographicFileName({
      organizationName: academyName,
      periodFileLabel: buildConversionInfographicPeriodFileLabel({
        startDate: selectedDateRange.startDate,
        endDate: selectedDateRange.endDate
      })
    })
  }

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
                  {metrics
                    ? `${metrics.periodLabel} · 접수된 신청 기준입니다.`
                    : "체험 이후 등록 전환을 기간별로 확인할 수 있습니다."}
                </p>
              </div>

              <div className={styles.analyticsActions}>
                {metrics ? <StudioDashboardPeriodControl selectedRange={selectedDateRange} /> : null}
                {infographicModel && infographicFileName ? (
                  <ConversionInfographicLauncher
                    model={infographicModel}
                    fileName={infographicFileName}
                  />
                ) : null}
              </div>
            </header>

            {analytics ? (
              <div className={styles.chartRow}>
                <article className={styles.chartCard} aria-labelledby="dashboard-stage-title">
                  <div className={styles.chartHead}>
                    <h3 className={styles.chartTitle} id="dashboard-stage-title">
                      신청 → 등록 흐름
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

                {/*
                  체험 이후 전환 현황.

                  위 막대와 다른 것을 센다. 위는 신청일 cohort 의 진행 단계고,
                  여기는 "체험을 마친 학생" cohort 의 이후 사실이다. 그래서
                  숫자가 서로 다를 수 있고, 분모를 화면에 항상 같이 적는다.

                  깔때기로 그리지 않는다 — 리포트 없이 등록되기도 하고 부모가
                  아무것도 남기지 않은 채 등록되기도 해서, 각 단계가 앞 단계의
                  부분집합이 아니다.
                */}
                {conversion?.data ? (
                  <article className={styles.chartCard} aria-labelledby="dashboard-conversion-title">
                    <div className={styles.chartHead}>
                      <h3 className={styles.chartTitle} id="dashboard-conversion-title">
                        체험 이후 전환 현황
                      </h3>
                      <p className={styles.chartDescription}>
                        {conversion.data.periodLabel}에 체험을 마친 학생을 기준으로, 이후 기록된
                        사실만 모았습니다.
                      </p>
                    </div>

                    {conversion.data.hasCohort ? (
                      <>
                        <ul className={styles.journeyRail}>
                          <li className={styles.journeyCard}>
                            <span className={styles.journeyLabel}>체험 완료</span>
                            <strong className={styles.journeyValue}>
                              {conversion.data.cohort.completedExperienceCount}건
                            </strong>
                            <span className={styles.journeyMeta}>기준이 되는 학생 수</span>
                          </li>
                          <li className={styles.journeyCard}>
                            <span className={styles.journeyLabel}>리포트 발행</span>
                            <strong className={styles.journeyValue}>
                              {conversion.data.reports.publishedExperienceCount}건
                            </strong>
                            <span className={styles.journeyMeta}>
                              체험 완료 중 {formatConversionRate(conversion.data.reports.coverageRate)}
                            </span>
                          </li>
                          <li className={styles.journeyCard}>
                            <span className={styles.journeyLabel}>부모 의향 확인</span>
                            <strong className={styles.journeyValue}>
                              {conversion.data.parentDecisions.total}건
                            </strong>
                            <span className={styles.journeyMeta}>
                              미확인 {conversion.data.parentDecisions.notCollected}건
                            </span>
                          </li>
                          <li className={styles.journeyCard}>
                            <span className={styles.journeyLabel}>등록 결과 확인</span>
                            <strong className={styles.journeyValue}>
                              {conversion.data.registrationResults.total}건
                            </strong>
                            <span className={styles.journeyMeta}>
                              미확정 {conversion.data.registrationResults.unresolved}건
                            </span>
                          </li>
                        </ul>

                        {/*
                          두 비율은 분모가 다르다. 한 줄로 합치면 어느 쪽 이야기인지
                          알 수 없게 되므로 분모를 각각 적는다.
                        */}
                        <div className={styles.rateRow}>
                          <div className={styles.rateBlock}>
                            <span className={styles.rateLabel}>체험 완료 대비 등록</span>
                            <strong className={styles.rateValue}>
                              {formatConversionRate(conversion.data.rates.overallEnrollmentRate)}
                            </strong>
                            <span className={styles.rateMeta}>
                              {formatRateFraction(
                                conversion.data.rates.overallNumerator,
                                conversion.data.rates.overallDenominator
                              )}
                            </span>
                          </div>
                          <div className={styles.rateBlock}>
                            <span className={styles.rateLabel}>등록 결과가 확인된 학생 중 등록</span>
                            <strong className={styles.rateValue}>
                              {formatConversionRate(conversion.data.rates.resolvedEnrollmentRate)}
                            </strong>
                            <span className={styles.rateMeta}>
                              {formatRateFraction(
                                conversion.data.rates.resolvedNumerator,
                                conversion.data.rates.resolvedDenominator
                              )}
                            </span>
                          </div>
                        </div>

                        <div className={styles.matrixWrap}>
                          <h4 className={styles.matrixTitle}>부모 의향과 실제 결과</h4>
                          {conversion.data.decisionResultMatrixTotal > 0 ? (
                            <table className={styles.matrix}>
                              <thead>
                                <tr>
                                  <th scope="col">부모가 남긴 생각</th>
                                  <th scope="col">{CONVERSION_MATRIX_COLUMN_LABELS.enrolled}</th>
                                  <th scope="col">{CONVERSION_MATRIX_COLUMN_LABELS.not_enrolled}</th>
                                  <th scope="col">
                                    {CONVERSION_MATRIX_COLUMN_LABELS.result_pending}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {conversion.data.decisionResultMatrix.map((row) => (
                                  <tr key={row.decision}>
                                    <th scope="row">
                                      {PARENT_DECISION_MATRIX_LABELS[row.decision]}
                                    </th>
                                    <td>{row.enrolled}</td>
                                    <td>{row.notEnrolled}</td>
                                    <td>{row.resultPending}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p className={styles.chartEmpty}>
                              아직 부모가 남긴 생각이 없습니다.
                            </p>
                          )}
                          <p className={styles.matrixNote}>
                            부모가 생각을 남긴 {conversion.data.decisionResultMatrixTotal}건만
                            포함했습니다. 남기지 않은 {conversion.data.parentDecisions.notCollected}건은
                            표에 넣지 않았습니다.
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className={styles.chartEmpty}>
                        이 기간에 체험을 마친 학생이 없습니다.
                      </p>
                    )}
                  </article>
                ) : conversion?.error ? (
                  <article className={styles.chartCard}>
                    <p className={styles.chartEmpty}>{conversion.error}</p>
                  </article>
                ) : null}
              </div>
            ) : (
              // 잠긴 것은 이 분석 하나다. 아래 운영 영역은 그대로 동작한다.
              <article className={styles.chartCard} aria-labelledby="dashboard-analytics-locked-title">
                <div className={styles.chartHead}>
                  <h3 className={styles.chartTitle} id="dashboard-analytics-locked-title">
                    스탠다드 플랜에서 볼 수 있습니다
                  </h3>
                  <p className={styles.chartDescription}>
                    상담 기록을 남기면 신청 → 등록 흐름과 등록 전환율을 기간별로 확인할 수 있습니다.
                  </p>
                </div>
                <p className={styles.chartEmpty}>
                  이미 저장된 체험 결과와 상담 이력은 상담·등록 화면에서 계속 확인할 수 있습니다.
                </p>
              </article>
            )}
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

        </>
      )}
    </div>
  )
}
