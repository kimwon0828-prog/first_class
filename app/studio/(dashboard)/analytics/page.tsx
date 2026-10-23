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
import { buildStudioDonutArcs } from "@/features/studio/lib/studio-dashboard-donut"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { buildStudioDashboardView } from "@/features/studio/lib/studio-dashboard-view"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { StudioDashboardPeriodControl } from "@/features/studio/ui/studio-dashboard-period-control"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2ChevronRightIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

type StudioAnalyticsPageProps = {
  searchParams?: Promise<{ preset?: string; startDate?: string; endDate?: string }>
}

const gradeLabel = (grade: string | null | undefined) => (grade ? getChildGradeLabel(grade) ?? grade : "")

/**
 * 분석 (홈에 있던 성과 분석을 그대로 옮긴 화면). 계산 · 조회는 홈 때와 같다 — 컴포넌트만 옮겼다.
 * 2차 분석 화면이 생기면 이 자리에서 바뀐다.
 */
export default async function StudioAnalyticsPage({ searchParams }: StudioAnalyticsPageProps) {
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
  const metrics = entitlements.canUseConversionAnalytics
    ? buildStudioDashboardMetrics(applications, selectedDateRange)
    : null
  const analytics = metrics ? buildStudioDashboardAnalytics(metrics) : null
  const donutCenter = STUDIO_DONUT_VIEWBOX / 2

  // 공유용 리포트는 위에서 만든 지표를 그대로 다시 그린다. 숫자를 새로 세지 않는다.
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
    { key: "noShow", label: "불참", count: metrics.trialOutcomes.noShow },
    { key: "canceled", label: "일반 취소", count: metrics.trialOutcomes.canceled },
    { key: "pending", label: "진행 전·진행 중", count: metrics.trialOutcomes.pending }
  ] : []
  const renderDonut = (segments: Array<{ key: string; label: string; count: number }>, total: number, centerLabel: string) => {
    const arcs = buildStudioDonutArcs(segments.map(segment => segment.count), total)
    return <div className={styles.donutLayout}>
      <div className={styles.donutWrap}>
        <svg className={styles.donut} width={STUDIO_DONUT_VIEWBOX} height={STUDIO_DONUT_VIEWBOX} viewBox={`0 0 ${STUDIO_DONUT_VIEWBOX} ${STUDIO_DONUT_VIEWBOX}`} aria-hidden="true">
          <circle className={styles.donutTrack} cx={donutCenter} cy={donutCenter} r={STUDIO_DONUT_RADIUS} strokeWidth={STUDIO_DONUT_STROKE} />
          {segments.map((segment, index) => {
            const arc = arcs[index]
            if (!arc) return null
            return arc.fullCircle
              ? <circle key={segment.key} className={styles[segment.key]} cx={donutCenter} cy={donutCenter} r={STUDIO_DONUT_RADIUS} strokeWidth={STUDIO_DONUT_STROKE} fill="none" />
              : <path key={segment.key} className={`${styles.donutSegment} ${styles[segment.key]}`} d={arc.path} />
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
        <div className={styles.headerText}>
          <h1 className={styles.title}>분석</h1>
          <p className={styles.description}>{metrics ? `${metrics.periodLabel} · 신청일 기준 · 기간 선택은 분석에만 적용돼요` : "신청부터 등록까지의 흐름을 봐요"}</p>
        </div>
        {metrics && !error ? <div className={styles.tools}>
          {infographicModel && infographicFileName ? <ConversionInfographicLauncher model={infographicModel} fileName={infographicFileName} /> : null}
          <StudioDashboardPeriodControl selectedRange={selectedDateRange} />
        </div> : null}
      </header>

      {error ? <section className={styles.errorCard} role="alert"><p>{error}</p><StudioQueryRetry /></section> : <>
        {metrics && analytics ? <div className={styles.chartRow}>
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
            <p className={styles.chartNote}>단계별 비율은 바로 앞 단계 대비예요.</p>
          </article>
          <article className={styles.chartCard} aria-labelledby="dashboard-trial-title">
            <h2 id="dashboard-trial-title" className={styles.chartTitle}>체험 결과</h2>
            {renderDonut(trialSegments, metrics.steps[0].count, "전체 신청")}
            <p className={styles.chartNote}>{analytics.hasCohort ? "선택 기간에 신청한 학생의 현재 체험 상태" : "선택 기간에 접수된 신청이 없어요."}</p>
          </article>
          <article className={styles.chartCard} aria-labelledby="dashboard-registration-chart-title">
            <h2 id="dashboard-registration-chart-title" className={styles.chartTitle}>등록 결과</h2>
            {renderDonut(analytics.donutSegments, analytics.donutTotal, "체험 완료")}
            <p className={styles.chartNote}>{analytics.hasDonutData ? "체험 완료 학생의 실제 등록 결과" : "아직 체험 완료 기록이 없어요."}</p>
          </article>
        </div> : <div className={styles.locked}>
          <div><strong>신청부터 등록까지, 흐름을 한눈에</strong><p>등록 전환 분석은 스탠다드 플랜에서 사용할 수 있어요. 상담·결과 기록은 지금도 그대로 남길 수 있어요.</p></div>
          <Link href={studioPath("/studio/billing")} className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>요금제 보기</Link>
        </div>}

        <div className={styles.bottom}>
          {analytics ? <details className={styles.reasons}>
            <summary>미등록 사유 상세 보기</summary>
            {analytics.unregisteredReasons.length ? <ul>{analytics.unregisteredReasons.map(reason => <li key={reason.key}><span>{reason.label}</span><strong>{reason.count}건</strong></li>)}</ul> : <p>선택 기간에 기록된 미등록 결과가 없어요.</p>}
          </details> : null}
          <article className={styles.recentCard} aria-labelledby="dashboard-registration-title">
            <div className={styles.recentHead}>
              <h2 id="dashboard-registration-title">최근 등록 결과</h2>
              <Link href={`${studioPath("/studio/cases")}?view=closed`} className={styles.moreLink}>전체 보기 ›</Link>
            </div>
            {view.recentRegistrationItems.length ? <ul className={styles.recentList}>{view.recentRegistrationItems.map(item => <li key={item.id}>
              <StudioDetailLink internalPath={item.href} className={styles.recentRow}>
                <span className={styles.recentText}>
                  <strong>{item.studentName}<small> {gradeLabel(item.studentGrade)}</small></strong>
                  <span>{item.classTitle}</span>
                </span>
                {item.whenLabel ? <span className={styles.recentDate}>{item.whenLabel}</span> : null}
                <V2StatusBadge tone={item.outcomeTone}>{item.outcomeLabel}</V2StatusBadge>
                <V2ChevronRightIcon size={18} className={styles.chevron} />
              </StudioDetailLink>
            </li>)}</ul> : <p className={styles.empty}>아직 날짜가 기록된 등록·미등록 결과가 없어요.</p>}
          </article>
        </div>
      </>}
    </div>
  )
}
