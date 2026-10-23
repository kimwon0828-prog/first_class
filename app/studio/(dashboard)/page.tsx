import { StudioDetailLink } from "@/features/studio/ui/studio-detail-link"
import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import Link from "next/link"
import { Fragment } from "react"

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
import {
  buildStudioDashboardView
} from "@/features/studio/lib/studio-dashboard-view"
import { resolveStudioDateRange } from "@/features/studio/lib/studio-date-range"
import { CASES_ACTIONS, formatCasesDate, getCasesScheduleLabel } from "@/features/studio/lib/cases-workflow"
import { STUDIO_APPLICATION_STATUS_LABELS } from "@/features/studio/lib/application-status-labels"
import { getStudioApplications } from "@/features/studio/queries/get-studio-applications"
import { getStudioCaseStageBoard, type StudioCaseStageCard, type StudioCaseStageKey } from "@/features/studio/queries/get-studio-cases"
import { StudioDashboardPeriodControl } from "@/features/studio/ui/studio-dashboard-period-control"
import { v2ButtonClassName } from "@/features/studio/ui/v2/v2-button"
import { V2ChevronRightIcon, V2PlusIcon } from "@/features/studio/ui/v2/v2-icons"
import { V2StatusBadge } from "@/features/studio/ui/v2/v2-status-badge"
import { getChildGradeLabel } from "@/shared/constants/education-taxonomy"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

type StudioIndexPageProps = {
  searchParams?: Promise<{ preset?: string; startDate?: string; endDate?: string }>
}

const gradeLabel = (grade: string | null | undefined) => (grade ? getChildGradeLabel(grade) ?? grade : "")

/* "가장 먼저" 카드의 버튼 글자. 누르면 상세의 해당 칸으로 이동만 한다. */
const FIRST_TASK_BUTTONS = {
  UNASSIGNED: "담당 배정하러 가기",
  NEEDS_COMPLETION: "완료 확인하러 가기",
  REVIEW_NEW: "일정 확정하러 가기",
  CONFIRM_SCHEDULE: "일정 확정하러 가기",
  NEEDS_REGISTRATION: "결과 기록하러 가기"
} as const

/* 홈 "체험에서 등록까지" 칸. 판정은 getStudioCaseStageBoard(deriveCasesWorkflow)가 했다 — 여기서는 글자만 고른다. */
const STAGE_COLUMNS: Array<{ key: StudioCaseStageKey; title: string; caption: string; moreQuery: string }> = [
  { key: "schedule", title: "일정 확정", caption: "확정을 기다리는 신청", moreQuery: "filter=schedule_needed" },
  { key: "record", title: "기록 작성", caption: "체험을 마친 학생", moreQuery: "view=closed&filter=undecided" },
  { key: "report", title: "리포트 보내기", caption: "기록 저장됨", moreQuery: "view=closed&filter=undecided" },
  { key: "registration", title: "등록 결과", caption: "리포트 받은 학부모", moreQuery: "view=closed&filter=undecided" }
]
const STAGE_ACTION_LABELS: Record<StudioCaseStageKey, string> = {
  schedule: CASES_ACTIONS.schedule.title,
  record: CASES_ACTIONS.record.title,
  report: CASES_ACTIONS.report.title,
  registration: CASES_ACTIONS.registration.title
}
const stageCardLines = (key: StudioCaseStageKey, card: StudioCaseStageCard) => {
  const schedule = getCasesScheduleLabel(card)
  if (key === "schedule") return { when: schedule, foot: `${formatCasesDate(card.createdAt)} 신청` }
  return {
    when: schedule ? `${schedule.replace(/^희망 /, "")} 체험` : null,
    foot: key === "record" ? (card.completedAt ? `${formatCasesDate(card.completedAt)} 체험 완료` : "체험 완료")
      : key === "report" ? "아직 안 보냄"
      : card.reportSentAt ? `리포트 ${formatCasesDate(card.reportSentAt)} 보냄` : "리포트 보냄"
  }
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
  const stageBoard = await getStudioCaseStageBoard(teacher.organizationId)
  const view = buildStudioDashboardView(applications)
  // 전환 분석은 유료다. 권한이 없으면 집계 자체를 하지 않는다 —
  // 계산해 두고 렌더만 감추면 전환 수치가 서버 payload 에 그대로 실려 나간다.
  // 운영 영역(확인할 일 / 예정 체험)은 같은 조회 결과에서 그대로 만든다.
  const metrics = entitlements.canUseConversionAnalytics
    ? buildStudioDashboardMetrics(applications, selectedDateRange)
    : null
  // "이번 달 전환"은 같은 지표 정의를 이번 달 신청 cohort 로 한 번 더 센다. 새 지표를 만들지 않는다.
  const monthRange = resolveStudioDateRange({ preset: "thisMonth" })
  const monthMetrics = entitlements.canUseConversionAnalytics
    ? buildStudioDashboardMetrics(applications, monthRange)
    : null
  const monthNumber = Number(monthRange.startDate?.slice(5, 7)) || null
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

  const [firstTask, ...nextTasks] = view.actionItems
  const firstTaskSchedule = firstTask?.scheduleAt
    ? getCasesScheduleLabel({ requestedSlotAt: firstTask.scheduleAt, confirmedSlotAt: firstTask.scheduleConfirmed ? firstTask.scheduleAt : null })
    : null
  const inTrialLabel = STUDIO_APPLICATION_STATUS_LABELS.in_trial
  const completionNeededLabel = STUDIO_APPLICATION_STATUS_LABELS.completion_needed

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.todayDate}>{view.todayLabel}</p>
          <h1 className={styles.title}>안녕하세요{teacher.name?.trim() ? `, ${teacher.name.trim()}님` : ""}!</h1>
        </div>
        <Link href={studioPath("/studio/classes/new")} className={v2ButtonClassName({ variant: "outline", size: "md" })}>
          <V2PlusIcon size={18} />수업 등록
        </Link>
      </header>

      {error ? <section className={styles.errorCard} role="alert"><p>{error}</p><StudioQueryRetry /></section> : <>
        <div className={styles.hero}>
          <section className={styles.firstTask} aria-labelledby="first-task-title">
            {firstTask ? <>
              <div className={styles.firstTaskHead}>
                <span className={styles.firstBadge}>가장 먼저</span>
                <span className={styles.firstCaption}>오늘 처리할 신청 {view.actionTotalCount}건 중 1번째</span>
                <span className={styles.progress} aria-hidden="true">
                  {view.actionItems.map((item, index) => <span key={item.id} data-current={index === 0 ? "" : undefined} />)}
                </span>
              </div>
              <div className={styles.firstTaskBody}>
                <h2 id="first-task-title" className={styles.firstTitle}>{firstTask.studentName} · {firstTask.actionLabel.replace(/\.$/, "")}</h2>
                <p className={styles.firstMeta}>
                  {[gradeLabel(firstTask.studentGrade), firstTask.classTitle, firstTaskSchedule].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className={styles.firstActions}>
                <StudioDetailLink internalPath={firstTask.href} section={firstTask.section} className={v2ButtonClassName({ variant: "primary", size: "lg" })}>
                  {FIRST_TASK_BUTTONS[firstTask.kind]}
                </StudioDetailLink>
                <V2StatusBadge tone={firstTask.statusTone}>{firstTask.statusLabel}</V2StatusBadge>
                {firstTask.section === "confirm-schedule" ? <span className={styles.firstHint}>확정하면 학부모에게 바로 알림이 가요</span> : null}
              </div>
              {nextTasks.length ? <div className={styles.nextTasks}>
                <div className={styles.nextHead}>
                  <h3>다음 할 일</h3>
                  <Link href={studioPath("/studio/cases")} className={styles.moreLink}>전체 보기 ›</Link>
                </div>
                <ul className={styles.nextList}>
                  {nextTasks.map(item => <li key={item.id}>
                    <StudioDetailLink internalPath={item.href} section={item.section} className={styles.nextRow}>
                      <span className={styles.nextText}>
                        <strong>{item.studentName}<small> {gradeLabel(item.studentGrade)}</small></strong>
                        <span>{item.classTitle} · {item.actionLabel}</span>
                      </span>
                      <V2StatusBadge tone={item.statusTone}>{item.statusLabel}</V2StatusBadge>
                      <V2ChevronRightIcon size={18} className={styles.chevron} />
                    </StudioDetailLink>
                  </li>)}
                </ul>
              </div> : null}
              {view.actionTotalCount > view.actionItems.length ? <p className={styles.previewNote}>전체 {view.actionTotalCount}건 중 {view.actionItems.length}건 미리보기 · 나머지는 전체 보기에서 확인해요.</p> : null}
            </> : <>
              <div className={styles.firstTaskHead}><span className={styles.firstBadge}>가장 먼저</span></div>
              <h2 id="first-task-title" className={styles.firstTitle}>지금 처리할 신청이 없어요</h2>
              <p className={styles.firstMeta}>새 신청이 들어오면 여기에서 먼저 알려 드릴게요.</p>
            </>}
          </section>

          <section className={styles.todayCard} aria-labelledby="today-title">
            <div className={styles.todayHead}>
              <h2 id="today-title">{view.scheduleMode === "today" ? "오늘 체험" : "다가오는 체험"}</h2>
              {view.scheduleMode === "today" ? <strong>{view.todayScheduleCount}명</strong> : null}
              <Link href={studioPath("/studio/schedule")} className={styles.moreLink}>수업·일정 ›</Link>
            </div>
            {view.scheduleItems.length ? <ul className={styles.slots}>
              {view.scheduleItems.map(item => {
                const inTrial = item.statusLabel === inTrialLabel
                const nowLabel = item.statusLabel === completionNeededLabel ? "완료 확인" : !item.teacherName ? "담당 배정" : null
                return <li key={item.id}>
                  <StudioDetailLink internalPath={item.href} className={styles.slot} data-in-trial={inTrial ? "" : undefined}>
                    <span className={styles.slotTime}><strong>{item.timeLabel}</strong>{item.dateLabel ? <small>{item.dateLabel}</small> : null}</span>
                    <span className={styles.slotDot} aria-hidden="true" />
                    <span className={styles.slotBody}>
                      <span className={styles.slotName}>{item.studentName}{item.studentGrade ? ` · ${gradeLabel(item.studentGrade)}` : ""}<V2StatusBadge tone={item.statusTone}>{item.statusLabel}</V2StatusBadge></span>
                      <span className={styles.slotMeta}>{item.classTitle} · {item.teacherName ?? <em>담당 미배정</em>}</span>
                    </span>
                    {nowLabel ? <span className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>{nowLabel}</span> : null}
                  </StudioDetailLink>
                </li>
              })}
            </ul> : <p className={styles.empty}>{view.scheduleMode === "today" ? "오늘 예정된 체험이 없어요." : "예정된 체험 일정이 없어요."}</p>}
          </section>
        </div>

        <section className={styles.pipeline} aria-labelledby="pipeline-title">
          <div className={styles.blockHead}>
            <h2 id="pipeline-title">체험에서 등록까지</h2>
            <p>체험 예정인 학생은 오늘 체험 · 수업·일정에서 봐요</p>
            <Link href={studioPath("/studio/cases")} className={styles.moreLink}>신청 전체보기 ›</Link>
          </div>
          {stageBoard.error ? <div role="alert" className={styles.inlineError}><p>{stageBoard.error}</p><StudioQueryRetry /></div> : null}
          <div className={styles.board}>
            {STAGE_COLUMNS.map((column, index) => {
              const stage = stageBoard.data[column.key]
              return <Fragment key={column.key}>
                {index > 0 ? <span className={styles.boardArrow} aria-hidden="true"><V2ChevronRightIcon size={20} /></span> : null}
                <section className={styles.stage} aria-labelledby={`stage-${column.key}`}>
                  <div className={styles.stageHead}>
                    <h3 id={`stage-${column.key}`}>{column.title}</h3>
                    <span className={styles.stageCount}>{stage.count}</span>
                  </div>
                  <p className={styles.stageCaption}>{column.caption}</p>
                  {stage.items.map(card => {
                    const lines = stageCardLines(column.key, card)
                    return <StudioDetailLink key={card.id} internalPath={`/studio/applications/${card.id}`} section={card.section} className={styles.stageCard}>
                      <span className={styles.stageWho}><strong>{card.student.name}</strong><small>{gradeLabel(card.student.grade)}</small></span>
                      <span className={styles.stageClass}>{card.klass.title ?? "수업 정보 없음"}</span>
                      {lines.when ? <span className={styles.stageWhen}>{lines.when}</span> : null}
                      <span className={styles.stageFoot}>
                        <span>{lines.foot}</span>
                        <span className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>{STAGE_ACTION_LABELS[column.key]}</span>
                      </span>
                    </StudioDetailLink>
                  })}
                  {!stage.items.length && !stageBoard.error ? <p className={styles.stageEmpty}>지금은 없어요</p> : null}
                  {stage.count > stage.items.length ? <Link href={`${studioPath("/studio/cases")}?${column.moreQuery}`} className={styles.stageMore}>{stage.count - stage.items.length}건 더 보기 ›</Link> : null}
                </section>
              </Fragment>
            })}
          </div>
        </section>

        <section className={styles.month} aria-labelledby="month-title">
          <div className={styles.monthHead}>
            <h2 id="month-title">{monthNumber ? `${monthNumber}월 등록 전환` : "이번 달 등록 전환"}</h2>
            {monthMetrics ? <a href="#analysis" className={styles.moreLink}>성과 분석 ›</a> : null}
          </div>
          {monthMetrics ? <div className={styles.monthBody}>
            <div className={styles.monthMain}>
              <strong className={styles.monthRate}>{monthMetrics.registrationConversionRate == null ? "—" : `${monthMetrics.registrationConversionRate}%`}</strong>
              <p>{monthMetrics.decidedCount
                ? `등록 결과가 나온 ${monthMetrics.decidedCount}명 중 ${monthMetrics.enrolledCount}명이 등록했어요`
                : "이번 달 신청 중 아직 등록 결과가 나온 학생이 없어요"}</p>
              <p className={styles.monthNote}>이번 달 신청 기준 · 등록 ÷ (등록 + 미등록)</p>
            </div>
            <dl className={styles.monthStats}>
              <div><dt>등록</dt><dd>{monthMetrics.enrolledCount}명</dd></div>
              <div><dt>미등록</dt><dd>{monthMetrics.notEnrolledCount}명</dd></div>
              <div><dt>결과 대기</dt><dd>{monthMetrics.pendingDecisionCount}명</dd></div>
            </dl>
          </div> : <div className={styles.locked}>
            <div><strong>신청부터 등록까지, 흐름을 한눈에</strong><p>등록 전환 분석은 스탠다드 플랜에서 사용할 수 있어요. 상담·결과 기록은 지금도 그대로 남길 수 있어요.</p></div>
            <Link href={studioPath("/studio/billing")} className={v2ButtonClassName({ variant: "tonal", size: "sm" })}>요금제 보기</Link>
          </div>}
        </section>

        <section id="analysis" className={styles.analysis} aria-labelledby="analysis-title">
          <div className={styles.blockHead}>
            <h2 id="analysis-title">성과 분석</h2>
            {metrics ? <p>{metrics.periodLabel} · 신청일 기준 · 기간 선택은 분석에만 적용돼요</p> : null}
            {metrics ? <div className={styles.analysisTools}>
              {infographicModel && infographicFileName ? <ConversionInfographicLauncher model={infographicModel} fileName={infographicFileName} /> : null}
              <StudioDashboardPeriodControl selectedRange={selectedDateRange} />
            </div> : null}
          </div>
          {metrics && analytics ? <div className={styles.chartRow}>
            <article className={`${styles.chartCard} ${styles.flowCard}`} aria-labelledby="dashboard-flow-title">
              <h3 id="dashboard-flow-title" className={styles.chartTitle}>신청 → 등록 흐름</h3>
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
              <h3 id="dashboard-trial-title" className={styles.chartTitle}>체험 결과</h3>
              {renderDonut(trialSegments, metrics.steps[0].count, "전체 신청")}
              <p className={styles.chartNote}>{analytics.hasCohort ? "선택 기간에 신청한 학생의 현재 체험 상태" : "선택 기간에 접수된 신청이 없어요."}</p>
            </article>
            <article className={styles.chartCard} aria-labelledby="dashboard-registration-chart-title">
              <h3 id="dashboard-registration-chart-title" className={styles.chartTitle}>등록 결과</h3>
              {renderDonut(analytics.donutSegments, analytics.donutTotal, "체험 완료")}
              <p className={styles.chartNote}>{analytics.hasDonutData ? "체험 완료 학생의 실제 등록 결과" : "아직 체험 완료 기록이 없어요."}</p>
            </article>
          </div> : null}

          <div className={styles.analysisBottom}>
            {analytics ? <details className={styles.reasons}>
              <summary>미등록 사유 상세 보기</summary>
              {analytics.unregisteredReasons.length ? <ul>{analytics.unregisteredReasons.map(reason => <li key={reason.key}><span>{reason.label}</span><strong>{reason.count}건</strong></li>)}</ul> : <p>선택 기간에 기록된 미등록 결과가 없어요.</p>}
            </details> : null}
            <article className={styles.recentCard} aria-labelledby="dashboard-registration-title">
              <div className={styles.recentHead}>
                <h3 id="dashboard-registration-title">최근 등록 결과</h3>
                <Link href={`${studioPath("/studio/cases")}?view=closed`} className={styles.moreLink}>전체 보기 ›</Link>
              </div>
              {view.recentRegistrationItems.length ? <ul className={styles.recentList}>{view.recentRegistrationItems.map(item => <li key={item.id}>
                <StudioDetailLink internalPath={item.href} className={styles.recentRow}>
                  <span className={styles.nextText}>
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
        </section>
      </>}
    </div>
  )
}
