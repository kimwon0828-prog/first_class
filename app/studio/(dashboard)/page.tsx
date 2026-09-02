import Link from "next/link"

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

const formatPercentage = (value: number | null) => (value == null ? "-" : `${value.toFixed(1)}%`)

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
          <div className={styles.periodControlWrap}>
            <StudioDashboardPeriodControl selectedRange={selectedDateRange} />
          </div>

          <section className={styles.performance} aria-labelledby="dashboard-performance-title">
            <header className={styles.performanceHead}>
              <div className={styles.performanceHeading}>
                <p className={styles.performanceEyebrow}>{metrics.periodLabel} 신청 기준</p>
                <h2 className={styles.performanceTitle} id="dashboard-performance-title">
                  운영 현황
                </h2>
                <p className={styles.performanceDescription}>
                  선택 기간에 접수된 신청이 현재 도달한 누적 단계를 보여줍니다.
                </p>
              </div>

              <div className={styles.conversionSummary}>
                <span className={styles.conversionLabel}>등록 전환율</span>
                <strong
                  className={styles.conversionValue}
                  aria-label={
                    metrics.registrationConversionRate == null
                      ? "등록 전환율 집계 전"
                      : `등록 전환율 ${metrics.registrationConversionRate.toFixed(1)}퍼센트`
                  }
                >
                  {formatPercentage(metrics.registrationConversionRate)}
                </strong>
                <span className={styles.conversionMeta}>
                  등록 {metrics.enrolledCount}건 / 결정 {metrics.decidedCount}건
                </span>
              </div>
            </header>

            <ol className={styles.pipeline} aria-label="신청 등록 전환 흐름">
              {metrics.steps.map((step, index) => (
                <li key={step.key} className={styles.pipelineStep}>
                  <span className={styles.pipelineContext}>
                    {index === 0 ? "기간 접수" : "누적 도달"}
                  </span>
                  <span className={styles.pipelineLabel}>{step.label}</span>
                  <strong className={styles.pipelineValue}>{step.count}</strong>
                  <span className={styles.pipelineTrack} aria-hidden="true">
                    <span className={styles.pipelineDot} />
                  </span>
                  {step.conversionFromPrevious != null ? (
                    <span
                      className={styles.pipelineRate}
                      aria-label={`전 단계 대비 ${step.conversionFromPrevious.toFixed(1)}퍼센트`}
                    >
                      전 단계 대비 {step.conversionFromPrevious.toFixed(1)}%
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>

            <footer className={styles.performanceFoot}>
              <span>등록 결정 {metrics.decidedCount}건</span>
              <span>등록 {metrics.enrolledCount}건</span>
              <span>미등록 {metrics.notEnrolledCount}건</span>
              <span>결정 대기 {metrics.pendingDecisionCount}건</span>
            </footer>
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
