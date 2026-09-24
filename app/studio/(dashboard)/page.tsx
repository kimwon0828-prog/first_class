import { StudioDetailLink } from "@/features/studio/ui/studio-detail-link"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
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
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import {
  buildStudioDashboardView
} from "@/features/studio/lib/studio-dashboard-view"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioDashboardPeriodControl } from "@/features/studio/ui/studio-dashboard-period-control"
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

type StudioIndexPageProps = {
  searchParams?: Promise<{ preset?: string; startDate?: string; endDate?: string }>
}

export default async function StudioIndexPage({ searchParams }: StudioIndexPageProps) {
  const studioPath = await getStudioNavigationPathResolver()
  const teacher = await requireTeacherStudioAccess()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const selectedDateRange = resolveStudioDateRange({
    preset: resolvedSearchParams?.preset,
    startDate: resolvedSearchParams?.startDate,
    endDate: resolvedSearchParams?.endDate
  })
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

  const trialSegments = metrics ? [
    { key: "completed", label: "체험 완료", count: metrics.trialOutcomes.completed },
    { key: "noShow", label: "노쇼", count: metrics.trialOutcomes.noShow },
    { key: "canceled", label: "일반 취소", count: metrics.trialOutcomes.canceled },
    { key: "pending", label: "진행 전·진행 중", count: metrics.trialOutcomes.pending }
  ] : []
  const renderDonut = (segments: Array<{ key: string; label: string; count: number }>, total: number, centerLabel: string) => {
    let consumed = 0
    return <div className={styles.donutLayout}>
      <div className={styles.donutWrap}>
        <svg className={styles.donut} viewBox={`0 0 ${STUDIO_DONUT_VIEWBOX} ${STUDIO_DONUT_VIEWBOX}`} aria-hidden="true">
          <circle className={styles.donutTrack} cx={donutCenter} cy={donutCenter} r={STUDIO_DONUT_RADIUS} strokeWidth={STUDIO_DONUT_STROKE} />
          {segments.map(segment => {
            const length = total ? segment.count / total * 100 : 0
            const offset = -consumed
            consumed += length
            return <circle key={segment.key} className={styles[segment.key]} cx={donutCenter} cy={donutCenter} r={STUDIO_DONUT_RADIUS} strokeWidth={STUDIO_DONUT_STROKE} fill="none" pathLength="100" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={offset} transform={`rotate(-90 ${donutCenter} ${donutCenter})`} />
          })}
        </svg>
        <div className={styles.donutCenter}><strong>{total}</strong><span>{centerLabel}</span></div>
      </div>
      <ul className={styles.legend}>
        {segments.map(segment => <li key={segment.key}>
          <span className={`${styles.legendDot} ${styles[segment.key]}`} aria-hidden="true" />
          <span>{segment.label}</span><strong>{segment.count}</strong>
          <span className={styles.legendRate}>{total ? `${(segment.count / total * 100).toFixed(1)}%` : "—"}</span>
        </li>)}
      </ul>
    </div>
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerIntro}>
          <h1 className={styles.title}>안녕하세요{teacher.name?.trim() ? `, ${teacher.name.trim()}님` : ""}!</h1>
          <p className={styles.subtitle}>오늘도 아이들의 더 좋은 첫 수업을 위해 함께해 주세요.</p>
        </div>
        <div className={styles.dashboardToolbar}>
          <div className={styles.toolbarStart}>
            {!error && infographicModel && infographicFileName ? <ConversionInfographicLauncher model={infographicModel} fileName={infographicFileName} /> : null}
          </div>
          <div className={styles.toolbarEnd}>
            <span className={styles.today}>{view.todayLabel}</span>
            {metrics ? <StudioDashboardPeriodControl selectedRange={selectedDateRange} /> : null}
          </div>
        </div>
      </header>

      {error ? <section className={styles.errorCard} role="alert"><p>{error}</p><StudioQueryRetry /></section> : <>
        <section className={styles.analytics} aria-label="핵심 성과 분석">
          {metrics && analytics ? <>
            <div className={styles.chartRow}>
              <article className={`${styles.chartCard} ${styles.flowCard}`} aria-labelledby="dashboard-flow-title">
                <h2 id="dashboard-flow-title" className={styles.chartTitle}>신청 → 등록 흐름</h2>
                <ol className={styles.flow}>
                  {metrics.steps.map((step, index) => <li key={step.key}>
                    <strong className={styles.flowValue}>{step.count}</strong>
                    <span className={styles.flowLabel}>{step.label}</span>
                    {index > 0 ? <span className={styles.flowRate} aria-label={`이전 단계 대비 ${step.conversionFromPrevious == null ? "산정 불가" : `${step.conversionFromPrevious}%`}`}>
                      {step.conversionFromPrevious == null ? "—" : `${step.conversionFromPrevious.toFixed(1)}%`}
                    </span> : <span className={styles.flowBase}>접수 기준</span>}
                  </li>)}
                </ol>
                <p className={styles.chartNote}>단계별 비율은 바로 앞 단계 대비입니다.</p>
              </article>
              <article className={styles.chartCard} aria-labelledby="dashboard-trial-title">
                <h2 id="dashboard-trial-title" className={styles.chartTitle}>체험 결과</h2>
                {renderDonut(trialSegments, metrics.steps[0].count, "전체 신청")}
                <p className={styles.chartNote}>{analytics.hasCohort ? "선택 기간에 신청한 학생의 현재 체험 상태" : "선택 기간에 접수된 신청이 없습니다."}</p>
              </article>
              <article className={styles.chartCard} aria-labelledby="dashboard-registration-chart-title">
                <h2 id="dashboard-registration-chart-title" className={styles.chartTitle}>등록 결과</h2>
                {renderDonut(analytics.donutSegments, analytics.donutTotal, "체험 완료")}
                <p className={styles.chartNote}>{analytics.hasDonutData ? "체험 완료 학생의 실제 등록 결과" : "아직 체험 완료 기록이 없습니다."}</p>
              </article>
            </div>
            <p className={styles.periodNote}>{metrics.periodLabel} · 신청일 기준 · 기간 선택은 분석에만 적용됩니다.</p>
          </> : <div className={styles.locked}>
            <div><strong>신청부터 등록까지, 흐름을 한눈에</strong><p>등록 전환 분석은 스탠다드 플랜에서 사용할 수 있어요. 상담·결과 기록은 지금도 그대로 남길 수 있어요.</p></div>
            <Link href={studioPath("/studio/billing")}>요금제 보기 →</Link>
          </div>}
        </section>

        <div className={styles.workspace}>
          <section className={`${styles.panel} ${styles.actionsPanel}`} aria-labelledby="dashboard-actions-title">
            <div className={styles.panelHead}>
              <h2 id="dashboard-actions-title">오늘 처리할 신청</h2><span className={styles.panelCount}>{view.actionTotalCount}건</span>
              <Link href={studioPath("/studio/cases")} className={styles.panelAction}>전체 보기 <span aria-hidden="true">›</span></Link>
            </div>
            {view.actionItems.length ? <ul className={styles.list}>{view.actionItems.map(item => <li key={item.id} className={styles.row}>
              <StudioDetailLink internalPath={item.href} className={styles.rowLink}>
                <span className={styles.rowBody}>
                  <span className={styles.rowTitle}>{item.studentName}<span className={styles.rowTitleSub}> · {item.studentGrade}</span></span>
                  <span className={styles.rowMeta}>{item.classTitle}</span>
                  <span className={styles.rowAction}>{item.actionLabel}</span>
                </span>
                <StudioStatusBadge tone={item.statusTone}>{item.statusLabel}</StudioStatusBadge><span className={styles.chevron} aria-hidden="true">›</span>
              </StudioDetailLink>
            </li>)}</ul> : <p className={styles.empty}>지금 확인이 필요한 신청이 없습니다.</p>}
          </section>

          <div className={styles.sidePanels}>
            <section className={styles.panel} aria-labelledby="dashboard-schedule-title">
              <div className={styles.panelHead}>
                <h2 id="dashboard-schedule-title">{view.scheduleMode === "today" ? "오늘 체험 일정" : "다가오는 체험 일정"}</h2>
                {view.todayScheduleCount > 0 ? <span className={styles.panelCount}>{view.todayScheduleCount}건</span> : null}
                <Link href={studioPath("/studio/schedule")} className={styles.panelAction}>일정 관리에서 보기 <span aria-hidden="true">›</span></Link>
              </div>
              {view.scheduleItems.length ? <ul className={styles.list}>{view.scheduleItems.map(item => <li key={item.id} className={styles.row}>
                <StudioDetailLink internalPath={item.href} className={styles.rowLink}>
                  <span className={styles.rowTime}><strong>{item.timeLabel}</strong>{item.dateLabel ? <span>{item.dateLabel}</span> : null}</span>
                  <span className={styles.rowBody}>
                    <span className={styles.rowTitle}>{item.studentName}<span className={styles.rowTitleSub}> · {item.studentGrade}</span></span>
                    <span className={styles.rowMeta}>{item.classTitle}</span><span className={styles.rowMeta}>{item.teacherName ?? "담당 미배정"}</span>
                  </span>
                  <StudioStatusBadge tone={item.statusTone}>{item.statusLabel}</StudioStatusBadge><span className={styles.chevron} aria-hidden="true">›</span>
                </StudioDetailLink>
              </li>)}</ul> : <p className={styles.empty}>예정된 체험 일정이 없습니다.</p>}
            </section>
            <section className={styles.panel} aria-labelledby="dashboard-registration-title">
              <div className={styles.panelHead}>
                <h2 id="dashboard-registration-title">최근 등록 결과</h2>
                <Link href={`${studioPath("/studio/cases")}?view=closed`} className={styles.panelAction}>전체 보기 <span aria-hidden="true">›</span></Link>
              </div>
              {view.recentRegistrationItems.length ? <ul className={styles.list}>{view.recentRegistrationItems.map(item => <li key={item.id} className={styles.row}>
                <StudioDetailLink internalPath={item.href} className={`${styles.rowLink} ${styles.registrationRow}`}>
                  <span className={styles.rowBody}><span className={styles.rowTitle}>{item.studentName}<span className={styles.rowTitleSub}> · {item.studentGrade}</span></span><span className={styles.rowMeta}>{item.classTitle}</span></span>
                  <span className={styles.resultDate}>{item.whenLabel}</span><StudioStatusBadge tone={item.outcomeTone}>{item.outcomeLabel}</StudioStatusBadge><span className={styles.chevron} aria-hidden="true">›</span>
                </StudioDetailLink>
              </li>)}</ul> : <p className={styles.empty}>아직 날짜가 기록된 등록·미등록 결과가 없습니다.</p>}
            </section>
          </div>
        </div>
        {analytics ? <div className={styles.analysisFooter}>
          <details className={styles.moreAnalysis}>
            <summary>미등록 사유 상세 보기</summary>
            {analytics.unregisteredReasons.length ? <ul>{analytics.unregisteredReasons.map(reason => <li key={reason.key}><span>{reason.label}</span><strong>{reason.count}건</strong></li>)}</ul> : <p>선택 기간에 기록된 미등록 결과가 없습니다.</p>}
          </details>
        </div> : null}
      </>}
    </div>
  )
}
