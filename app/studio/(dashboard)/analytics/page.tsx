import Link from "next/link"
import type { CSSProperties } from "react"

import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import { listStudioCurrentParentDecisions } from "@/features/decisions/queries/list-studio-current-parent-decisions"
import {
  buildConversionInfographicFileName,
  buildConversionInfographicModel,
  buildConversionInfographicPeriodFileLabel
} from "@/features/reports/lib/conversion-infographic-model"
import { ConversionInfographicLauncher } from "@/features/reports/ui/conversion-infographic-launcher"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { buildStudioAnalyticsView, resolveAnalyticsMonthLabels } from "@/features/studio/lib/studio-analytics-view"
import { buildStudioDashboardAnalytics } from "@/features/studio/lib/studio-dashboard-analytics"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { getStudioApplicationsForDashboard } from "@/features/studio/queries/get-studio-applications"
import { getStudioSettingsOrganization } from "@/features/studio/queries/get-studio-settings-organization"
import { StudioDashboardPeriodControl } from "@/features/studio/ui/studio-dashboard-period-control"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2DownloadIcon, V2InfoIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2SubjectIcon3D } from "@/features/studio/ui/v2/v2-subject-icon-3d"
import { buildRecontactStudents, getStudentDecisionApplicationIds, groupStudentApplications } from "@/features/students/lib/student-grouping"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

type StudioAnalyticsPageProps = {
  searchParams?: Promise<{ preset?: string; startDate?: string; endDate?: string }>
}

const widthStyle = (percent: number) => ({ "--bar": `${percent}%` }) as CSSProperties

/**
 * 분석 (Figma 2148:6580).
 *
 *   머리(제목 · 설명 | 성과 리포트 보기) → 기간 칩 → 숫자 카드 4 → [신청 → 등록 흐름 | 등록하지 않은 이유] → 수업별 전환
 *
 * 숫자는 신청일 cohort 하나에서 나오고(buildStudioDashboardMetrics), 전환율은 등록 ÷ 체험 완료
 * (computeTrialEnrollmentRate) 하나만 쓴다. 표시 모델은 studio-analytics-view.ts.
 * 전환 분석은 유료다 — 권한이 없으면 집계 자체를 하지 않는다(숫자가 payload 에 실리지 않게).
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
  // 사이드바 건수와 같은 요청 cache 를 쓴다 — 이 화면 때문에 신청 목록을 두 번 읽지 않는다.
  const [{ data: applications, error }, { entitlements }] = await Promise.all([
    getStudioApplicationsForDashboard(teacher.organizationId),
    getStudioEntitlementsForDisplay(teacher.organizationId)
  ])

  let view = null
  if (entitlements.canUseConversionAnalytics && !error) {
    // 다시 연락할 학생 = 학생 탭 · 홈과 같은 함수(학생 단위, 미등록 + 고민 중).
    // 의향은 그 판정용 대표 신청 + "희망 시간 불일치" 요일 문장용 미등록 신청을 한 번에 읽는다.
    const groups = groupStudentApplications(applications)
    const decisionIds = new Set([
      ...getStudentDecisionApplicationIds(groups),
      ...applications.filter((item) => item.registrationStatus === "not_enrolled" && !item.personalDataErased).map((item) => item.id)
    ])
    const decisions = await listStudioCurrentParentDecisions(Array.from(decisionIds))
    view = buildStudioAnalyticsView({
      applications,
      range: selectedDateRange,
      recontactCount: buildRecontactStudents(groups, decisions.data).students.length,
      decisions: decisions.data
    })
  }

  // 성과 리포트(인포그래픽)는 위에서 만든 지표를 그대로 다시 그린다. 숫자를 새로 세지 않는다.
  let infographic: { model: ReturnType<typeof buildConversionInfographicModel>; fileName: string } | null = null
  if (view) {
    let academyName = teacher.name?.trim() || "우리 학원"
    try {
      const organization = await getStudioSettingsOrganization(teacher)
      academyName =
        [organization?.name?.trim(), organization?.branchName?.trim()].filter((value): value is string => Boolean(value)).join(" ") ||
        academyName
    } catch {
      // 학원 이름은 표시용이다. 못 읽어도 리포트는 만든다.
    }
    infographic = {
      model: buildConversionInfographicModel({
        organizationName: academyName,
        metrics: view.metrics,
        analytics: buildStudioDashboardAnalytics(view.metrics),
        generatedAt: new Date()
      }),
      fileName: buildConversionInfographicFileName({
        organizationName: academyName,
        periodFileLabel: buildConversionInfographicPeriodFileLabel({
          startDate: selectedDateRange.startDate,
          endDate: selectedDateRange.endDate
        })
      })
    }
  }

  const months = resolveAnalyticsMonthLabels()

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>분석</h1>
          <p className={styles.description}>신청부터 등록까지 어디서 줄어드는지 봐요. 신청일 기준이에요.</p>
        </div>
        {/* Figma "분기 리포트 받기 (PDF)" 자리. 분기 PDF 는 2차라 지금은 기존 성과 리포트(인포그래픽)를 연다. */}
        {infographic ? (
          <ConversionInfographicLauncher
            model={infographic.model}
            fileName={infographic.fileName}
            label="성과 리포트 보기"
            icon={<V2DownloadIcon size={16} />}
          />
        ) : null}
      </header>

      {view ? (
        <StudioDashboardPeriodControl
          selectedRange={selectedDateRange}
          basePath="/studio/analytics"
          presets={[
            { value: "thisMonth", label: months.thisMonth },
            { value: "lastMonth", label: months.lastMonth },
            { value: "last3Months", label: "최근 3개월" }
          ]}
          customLabel="직접 고르기"
        />
      ) : null}

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p>{error}</p>
          <StudioQueryRetry />
        </section>
      ) : !view ? (
        <div className={styles.locked}>
          <div>
            <strong>신청부터 등록까지, 흐름을 한눈에</strong>
            <p>등록 전환 분석은 스탠다드 플랜에서 사용할 수 있어요. 상담·결과 기록은 지금도 그대로 남길 수 있어요.</p>
          </div>
          <Link href={studioPath("/studio/billing")} className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>
            요금제 보기
          </Link>
        </div>
      ) : (
        <>
          <section className={styles.cards} aria-label={`${view.periodLabel} 요약`}>
            {view.cards.map((card) => (
              <article key={card.key} className={card.tone === "brand" ? `${styles.card} ${styles.cardBrand}` : styles.card}>
                <h2 className={styles.cardLabel}>{card.label}</h2>
                <p className={styles.cardValue}>{card.value}</p>
                {card.caption || card.sub ? (
                  <p className={styles.cardCaption}>
                    {card.caption}
                    {/* 결과 대기는 캡션 줄 끝에 작게 — Figma 카드 높이를 그대로 둔다 */}
                    {card.sub ? <span className={styles.cardSub}>{card.caption ? " · " : ""}{card.sub}</span> : null}
                  </p>
                ) : null}
              </article>
            ))}
          </section>

          <div className={styles.split}>
            <section className={styles.flowSection} aria-labelledby="analytics-flow-title">
              <h2 id="analytics-flow-title" className={styles.sectionTitle}>신청 → 등록 흐름</h2>
              {view.hasCohort ? (
                <ol className={styles.flowList}>
                  {view.flow.map((step) => (
                    <li key={step.key} className={styles.flowRow}>
                      <div className={styles.flowHead}>
                        <span className={styles.flowLabel}>{step.label}</span>
                        <span className={styles.flowCount}>{step.count}명</span>
                        <span className={styles.spacer} />
                        {step.fromPrevious ? (
                          <span className={step.biggestDrop ? `${styles.flowRate} ${styles.flowRateDrop}` : styles.flowRate}>{step.fromPrevious}</span>
                        ) : null}
                      </div>
                      <span className={styles.flowTrack} aria-hidden="true">
                        <span
                          className={step.tone === "brand" ? `${styles.flowFill} ${styles.flowFillBrand}` : styles.flowFill}
                          style={widthStyle(step.widthPercent)}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className={styles.empty}>선택한 기간에 들어온 신청이 없어요.</p>
              )}
              {view.insight ? (
                <div className={styles.insight}>
                  <V2InfoIcon size={18} className={styles.insightIcon} />
                  <p>{view.insight.text}</p>
                  {view.insight.showStudents ? (
                    <Link href={`${studioPath("/studio/students")}?tab=recontact`} className={styles.insightLink}>
                      학생 보기 ›
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className={styles.reasonSection} aria-labelledby="analytics-reason-title">
              <h2 id="analytics-reason-title" className={styles.sectionTitle}>등록하지 않은 이유</h2>
              {view.reasons.length ? (
                <ul className={styles.reasonList}>
                  {view.reasons.map((reason) => (
                    <li key={reason.key} className={styles.reasonRow}>
                      <div className={styles.reasonHead}>
                        <span>{reason.label}</span>
                        <span className={styles.spacer} />
                        <strong>{reason.count}명</strong>
                      </div>
                      <span className={styles.reasonTrack} aria-hidden="true">
                        <span
                          className={reason.top ? `${styles.reasonFill} ${styles.reasonFillTop}` : styles.reasonFill}
                          style={widthStyle(reason.widthPercent)}
                        />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.empty}>선택한 기간에 등록하지 않은 학생이 없어요.</p>
              )}
              {view.reasonDayNote ? <p className={styles.reasonNote}>{view.reasonDayNote}</p> : null}
            </section>
          </div>

          <section className={styles.classSection} aria-labelledby="analytics-class-title">
            <h2 id="analytics-class-title" className={styles.sectionTitle}>수업별 전환</h2>
            {view.classRows.length ? (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th scope="col">수업</th>
                      <th scope="col" className={styles.numCol}>신청</th>
                      <th scope="col" className={styles.numCol}>체험</th>
                      <th scope="col" className={styles.numCol}>등록</th>
                      <th scope="col" className={styles.rateCol}>전환율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.classRows.map((row) => (
                      <tr key={row.classId}>
                        <th scope="row">
                          <span className={styles.classCell}>
                            <V2SubjectIcon3D categoryCode={row.categoryCode} size={32} />
                            <span className={styles.classTitle}>{row.title}</span>
                          </span>
                        </th>
                        <td className={styles.numCol}>{row.applicationCount}명</td>
                        <td className={styles.numCol}>{row.completedCount}명</td>
                        <td className={styles.numCol}>{row.enrolledCount}명</td>
                        <td className={styles.rateCol}>
                          <span className={styles.rateCell}>
                            <span className={styles.rateTrack} aria-hidden="true">
                              <span className={styles.rateFill} style={widthStyle(row.rate ?? 0)} />
                            </span>
                            <strong>{row.rateText}</strong>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className={styles.empty}>선택한 기간에 신청이 들어온 수업이 없어요.</p>
            )}
          </section>
        </>
      )}
    </div>
  )
}
