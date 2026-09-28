import { StudioQueryRetry } from "@/features/studio/ui/studio-query-retry"
import { resolveStudioDetailReturn } from "@/features/studio/lib/studio-detail-navigation"
import { getParentCrossProductHref } from "@/shared/config/cross-product-navigation"
import { getRequestHostname } from "@/shared/lib/request-host"
import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getStudioRegistrationStatusLabel,
  getStudioRegistrationStatusTone,
  getStudioStatusLabel
} from "@/features/studio/lib/application-status-labels"
import { CASE_STAGE_LABELS, getCaseDisplayStage } from "@/features/studio/lib/case-view-model"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationAssigneeOptions } from "@/features/studio/queries/get-studio-application-assignee-options"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { ApplicationAssigneeForm } from "@/features/studio/ui/application-assignee-form"
import { getStudioEntitlementsForDisplay } from "@/features/billing/queries/get-organization-entitlements"
import { ApplicationReportPublishing, type ReportPublishBlocker } from "@/features/studio/ui/application-report-publishing"
import { ApplicationTrialResultWorkflow } from "@/features/studio/ui/application-trial-result-workflow"
import {
  buildExperienceReportSnapshotV2,
  hasPublishableReportContent
} from "@/features/reports/lib/experience-report-snapshot"
import { getPublishedExperienceReport } from "@/features/reports/queries/get-published-experience-report"
import { getStudioParentDecision } from "@/features/decisions/queries/get-studio-parent-decision"
import { getStudioRegistrationResult } from "@/features/registration/queries/get-studio-registration-result"
import { StudioParentDecision } from "@/features/decisions/ui/studio-parent-decision"
import { isLegacyTrialResultObservation } from "@/features/studio/lib/trial-result-options"
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"
import { getSubjectLabel } from "@/shared/constants/education-taxonomy"
import { getSeoulDateTimeParts, SEOUL_TIME_ZONE } from "@/shared/lib/seoul-datetime"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"

import styles from "./page.module.css"

type StudioApplicationDetailPageProps = {
  searchParams?: Promise<{ returnTo?: string }>
  params: Promise<{
    id: string
  }>
}

const normalizeKoreanDayPeriod = (value: string) =>
  value.replace(/\bAM\b/gi, "오전").replace(/\bPM\b/gi, "오후")

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return normalizeKoreanDayPeriod(new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: SEOUL_TIME_ZONE
  }).format(date))
}

const getSelectedScheduleDurationMinutes = (selectedLabel: string | null) => {
  const match = selectedLabel?.match(/(\d{1,2}):(\d{2})\s*[~～]\s*(\d{1,2}):(\d{2})/)
  if (!match) {
    return null
  }

  const [, startHourText, startMinuteText, endHourText, endMinuteText] = match
  const startHour = Number(startHourText)
  const startMinute = Number(startMinuteText)
  const endHour = Number(endHourText)
  const endMinute = Number(endMinuteText)

  if (
    startHour > 23 ||
    endHour > 23 ||
    startMinute > 59 ||
    endMinute > 59
  ) {
    return null
  }

  const startTotal = startHour * 60 + startMinute
  const endTotal = endHour * 60 + endMinute
  if (startTotal === endTotal) {
    return null
  }

  return endTotal > startTotal ? endTotal - startTotal : 24 * 60 - startTotal + endTotal
}

const formatScheduleRange = (scheduleStartAt: string, selectedLabel: string | null) => {
  const startText = formatDateTime(scheduleStartAt)
  const durationMinutes = getSelectedScheduleDurationMinutes(selectedLabel)
  const startDate = new Date(scheduleStartAt)

  if (!startText || !durationMinutes || Number.isNaN(startDate.getTime())) {
    return startText
  }

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)
  const endText = normalizeKoreanDayPeriod(new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: SEOUL_TIME_ZONE
  }).format(endDate))

  return `${startText} ~ ${endText}`
}

const formatDateWithWeekdayTime = (value: string | null | undefined, options?: { hour12?: boolean }) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const dateParts = getSeoulDateTimeParts(date)
  if (!dateParts) {
    return null
  }

  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
  const time = normalizeKoreanDayPeriod(new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: options?.hour12 ?? false,
    timeZone: SEOUL_TIME_ZONE
  }).format(date))

  return `${dateParts.month}월 ${dateParts.day}일 (${weekday}) ${time}`
}

const resolveScheduleSummary = (
  requestedSlotAt: string,
  confirmedSlotAt: string | null,
  selectedLabel?: string | null
) => {
  const confirmedAt = confirmedSlotAt ? formatDateTime(confirmedSlotAt) : null
  const requestedAt = requestedSlotAt ? formatDateTime(requestedSlotAt) : null
  const normalizedSelectedLabel = selectedLabel?.trim() ? selectedLabel.trim() : null

  if (confirmedSlotAt && confirmedAt) {
    return {
      primary: formatScheduleRange(confirmedSlotAt, normalizedSelectedLabel) ?? confirmedAt,
      secondary: null
    }
  }

  if (requestedAt) {
    return {
      primary: formatScheduleRange(requestedSlotAt, normalizedSelectedLabel) ?? requestedAt,
      secondary: null
    }
  }

  if (normalizedSelectedLabel) {
    return {
      primary: normalizedSelectedLabel,
      secondary: null
    }
  }

  return {
    primary: "일정 협의 필요",
    secondary: null
  }
}

const normalizeText = (value: string | null | undefined) => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return normalized.length > 0 && normalized !== "-" ? normalized : null
}

const detailViewSubjectAndProgramLabel = (subject: string | null, programTypeLabel: string) => {
  if (subject) {
    return `${subject} ${programTypeLabel}`
  }

  return programTypeLabel
}

const formatProgressDate = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    timeZone: SEOUL_TIME_ZONE
  }).format(date)
}

export default async function StudioApplicationDetailPage({ params, searchParams }: StudioApplicationDetailPageProps) {
  const studioPath = await getStudioNavigationPathResolver()
  const back = resolveStudioDetailReturn((await searchParams)?.returnTo)
  const hostname = await getRequestHostname()
  const teacher = await requireTeacherStudioAccess()
  const resolvedParams = await params
  const { data, error } = await getStudioApplicationDetail(resolvedParams.id, teacher.organizationId, { allowPartialTrialResult: true })
  const assigneeOptionsResult = data
    ? await getStudioApplicationAssigneeOptions(teacher.organizationId)
    : { data: [], error: null }

  if (!error && !data) {
    notFound()
  }

  // 서버가 정한 한 시각을 이 화면 전체가 공유한다(단계 표시와 다음 할 일이 같은 시각을 본다).
  const nowIso = new Date().toISOString()
  const { entitlements } = await getStudioEntitlementsForDisplay(teacher.organizationId)

  // 지금 부모에게 공개돼 있는 발행본. 체험을 마친 Case 에서만 의미가 있다.
  const publishedReportResult =
    data && data.status === "completed"
      ? await getPublishedExperienceReport(data.id)
      : { data: null, error: null }

  // 학부모가 남긴 현재 생각. 읽기 전용이며 등록 결과와 별개다.
  const parentDecisionResult =
    data && data.status === "completed"
      ? await getStudioParentDecision(data.id)
      : { data: null, error: null }

  // 지금 확정된 등록 결과. 학부모가 남긴 생각과 다른 값이며 서로 섞지 않는다.
  const registrationResult =
    data && data.status === "completed"
      ? await getStudioRegistrationResult(data.id)
      : { data: null, error: null }

  /*
   * 발행 영역이 쓸 값을 서버에서 만든다.
   *
   * ⚠️ 미리보기를 화면에서 다시 조립하지 않는다. 공개 가능한 field 를 정하는 곳은
   *    buildExperienceReportSnapshotV2 하나다 — 화면이 따로 만들면 그 whitelist 를
   *    비켜 가는 경로가 생긴다.
   */
  const reportView = (() => {
    if (!data || data.status !== "completed") {
      return null
    }

    const trialResult = data.trialResult
    const blockers: ReportPublishBlocker[] = []

    if (!data.parentId) {
      blockers.push({ kind: "parent_not_linked" })
    }

    if (!trialResult) {
      blockers.push({ kind: "no_assessment" })
    }

    // 옛 기준 문구는 자동으로 발행하지 않는다. 원문을 그대로 보여 주고
    // 원장이 현재 기준 항목을 다시 고르게 한다(R0.1 계약).
    const legacyValues = (trialResult?.observations ?? []).filter((value) =>
      isLegacyTrialResultObservation(value)
    )
    if (legacyValues.length > 0) {
      blockers.push({ kind: "legacy_observations", values: legacyValues })
    }

    const experienceDate = data.confirmedSlotAt ?? data.completedAt ?? null
    if (!experienceDate) {
      blockers.push({ kind: "experience_date_missing" })
    }

    // blocker 순서가 곧 원장이 보는 안내의 우선순위다.
    // parent → no_assessment → legacy → date → content 순서를 유지한다.
    // legacy 가 있는 row 는 "내용 없음" 보다 legacy 안내가 먼저다 —
    // 옛 기록을 현재 기준으로 다시 확인하는 것이 먼저 할 일이기 때문이다.
    const built = trialResult
      ? buildExperienceReportSnapshotV2({
          programType: data.classProgramType ?? "trial_class",
          confirmedSlotAt: data.confirmedSlotAt,
          completedAt: data.completedAt,
          childName: data.childName,
          childGrade: data.childGrade,
          academyName: data.academyName ?? "",
          classTitle: data.classTitle ?? "",
          observations: trialResult.observations,
          recommendedCourse: trialResult.recommendedCourse,
          recommendedLevel: trialResult.recommendedLevel,
          recommendedSchedule: trialResult.recommendedSchedule,
          publicSummary: data.trialResult?.publicSummary ?? null
        })
      : null

    // ⚠️ 조회 실패를 "발행본 없음" 으로 접지 않는다.
    //
    // 둘을 같은 null 로 다루면, 이미 발행된 리포트가 있는데도 화면이
    // "공개 중인 리포트가 없습니다" 라고 말한다. 원장이 그 말을 믿고 발행을
    // 누르면 의도하지 않은 새 version 이 생기고 기존 발행본이 superseded 된다.
    // 모르는 것은 모른다고 말하고 손을 멈춘다.
    const publishedReportLoadError = publishedReportResult.error
    // 발행할 만한 내용이 있는가. snapshot 을 만들 수 있는가와 다른 판정이다.
    // 앞선 blocker 가 이미 잡은 Case 는 다시 세지 않는다.
    if (
      blockers.length === 0 &&
      built?.status === "ok" &&
      !hasPublishableReportContent(built.snapshot)
    ) {
      blockers.push({ kind: "report_content_missing" })
    }

    const published = publishedReportLoadError ? null : publishedReportResult.data

    // 마지막 발행 이후 평가가 수정됐는가. 두 시각 모두 서버 값이다.
    // 발행본을 모르는 상태에서는 판단하지 않는다.
    const assessmentChangedSincePublish = Boolean(
      published &&
        trialResult &&
        new Date(trialResult.updatedAt).getTime() > new Date(published.publishedAt).getTime()
    )

    return {
      preview: built?.status === "ok" ? built.snapshot : null,
      published,
      publishedReportLoadError,
      blockers,
      assessmentChangedSincePublish,
      assessmentUpdatedAt: trialResult?.updatedAt ?? null
    }
  })()
  const detailView = data
    ? (() => {
        const requestedSchedule =
          resolveScheduleSummary(data.requestedSlotAt, null, data.selectedScheduleLabel).primary
        const confirmedSchedule = data.confirmedSlotAt
          ? resolveScheduleSummary(data.requestedSlotAt, data.confirmedSlotAt, data.selectedScheduleLabel).primary
          : null
        const applicationDate = formatDateTime(data.createdAt) ?? "신청일 미기록"
        const applicationDateDetail = formatDateWithWeekdayTime(data.createdAt, { hour12: true }) ?? applicationDate
        // 등록 축은 체험을 마친 뒤부터 의미가 있다. 체험 전에는 진행 축 배지와 경쟁만 한다.
        // 파생 `체험 중` 이 아니라 실제 status 를 본다(디자인 시스템 §4.2 Case Header).
        const showRegistrationBadge = data.status === "completed"
        const registrationTone = getStudioRegistrationStatusTone(data.registrationStatus)
        const registrationLabel = getStudioRegistrationStatusLabel(data.registrationStatus)
        const statusLabel = getStudioStatusLabel(data)
        const programTypeLabel =
          data.classProgramType === "trial_class"
            ? "체험수업"
            : data.classProgramType === "level_test"
              ? "레벨테스트"
              : "미확인"
        const parentName = normalizeText(data.parentName)
        const parentPhone = normalizeText(data.parentPhone)
        const childGrade = normalizeText(data.childGrade)
        const childSchool = normalizeText(data.childSchool)
        const currentLevel = normalizeText(data.currentLevel)
        const childNotes = normalizeText(data.childNotes)
        const parentMemo = normalizeText(data.memo)
        const classSubject = getSubjectLabel(normalizeText(data.classSubject))
        const classRegion = normalizeText(data.classRegion)
        const normalizedPreferredRegularSchedule = normalizeText(data.preferredRegularSchedule)
        const normalizedGoalNote = normalizeText(data.goalNote)
        const classTitle =
          normalizeText(data.classTitle) ??
          (data.classProgramType === "trial_class"
            ? "체험수업"
            : data.classProgramType === "level_test"
              ? "레벨테스트"
              : "수업 정보 미연결")
        const completedMetaParts = [
          detailViewSubjectAndProgramLabel(classSubject, programTypeLabel),
          parentName
        ].filter((value): value is string => Boolean(value))
        const phoneHref = parentPhone ? `tel:${parentPhone}` : null
        const smsHref = parentPhone ? `sms:${parentPhone}` : null
        // 진행 상태 한 줄 요약이 쓰는 시각. 없는 값은 null 로 두고 표시하지 않는다.
        const timelineDateByStep: Record<"new" | "confirmed" | "completed" | "registration", string | null> = {
          new: data.logs.find((log) => log.toStatus === "new")?.createdAt ?? data.createdAt,
          confirmed:
            data.logs.find((log) => log.toStatus === "confirmed")?.createdAt ??
            data.confirmedSlotAt ??
            null,
          completed:
            data.logs.find((log) => log.toStatus === "completed")?.createdAt ?? data.completedAt ?? null,
          registration:
            data.registrationStatus === "undecided"
              ? null
              : data.logs.find((log) => log.note?.includes("등록 상태"))?.createdAt ??
                data.enrolledAt ??
                data.updatedAt
        }
        const currentTimelineIndex =
          data.status === "new"
            ? 0
            : data.status === "reviewing"
              ? 0
              : data.status === "confirmed"
                ? 1
                : data.status === "completed"
                  ? 2
                  : 3
        const isTerminalCanceled = data.status === "canceled"

        // 큰 Stepper 대신 한 줄 요약으로 축소한다. 없는 timestamp 는 추정하지 않는다.
        // 확정 체험이 시작됐으면 표시만 "체험 중" 으로 바꾼다(DB 는 confirmed 그대로).
        // 종료 시각이 지나도 "체험 완료" 로 만들지 않는다 — 완료는 원장이 확정한다.
        const caseStage = getCaseDisplayStage({
          status: data.status,
          noShowAt: data.noShowAt,
          registrationStatus: data.registrationStatus,
          confirmedBlockStartAt: data.confirmedBlockStartAt,
          confirmedBlockEndAt: data.confirmedBlockEndAt,
          confirmedSlotAt: data.confirmedSlotAt,
          scheduleStartTime: data.scheduleStartTime,
          scheduleEndTime: data.scheduleEndTime
        }, new Date(nowIso))
        // 확정 시각의 source of truth 는 RegistrationResult 다.
        // 조회에 실패했거나(에러) 아직 결과가 기록되지 않은 legacy Case 에서만
        // 기존 timestamp 로 돌아간다 — 화면이 빈칸이 되지 않게.
        const resolvedAtFromResult = registrationResult.data?.resolvedAt ?? null
        const closedStep =
          caseStage === "enrolled"
            ? { label: "등록", at: resolvedAtFromResult ?? data.enrolledAt }
            : caseStage === "not_enrolled"
              ? { label: "미등록", at: resolvedAtFromResult ?? data.lostAt }
              : caseStage === "no_show"
                ? { label: "노쇼", at: data.noShowAt }
                : caseStage === "canceled"
                  ? { label: "취소", at: data.canceledAt }
                  : { label: null, at: null }
        const progressSteps = [
          { label: "신청", at: timelineDateByStep.new },
          { label: "일정 확정", at: timelineDateByStep.confirmed },
          { label: "체험 완료", at: timelineDateByStep.completed },
          closedStep
        ]
          .map((step) => {
            const dateText = formatProgressDate(step.at)
            return step.label && dateText ? `${step.label} ${dateText}` : null
          })
          .filter((step): step is string => Boolean(step))

        return {
          requestedSchedule,
          confirmedSchedule,
          applicationDate,
          applicationDateDetail,
          showRegistrationBadge,
          registrationTone,
          registrationLabel,
          statusLabel: caseStage === "in_trial" ? CASE_STAGE_LABELS.in_trial : statusLabel,
          programTypeLabel,
          parentName,
          parentPhone,
          childGrade,
          childSchool,
          currentLevel,
          childNotes,
          parentMemo,
          classSubject,
          classRegion,
          normalizedPreferredRegularSchedule,
          normalizedGoalNote,
          classTitle,
          completedMeta: completedMetaParts.join(" · "),
          phoneHref,
          smsHref,
          timelineDateByStep,
          currentTimelineIndex,
          isTerminalCanceled,
          progressSteps,
          caseStageLabel: CASE_STAGE_LABELS[caseStage]
        }
      })()
    : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <Link href={studioPath(back.pathname) + back.search} className={styles.backLink}>
            {back.label}
          </Link>
        </div>
        <h1 className={styles.pageTitle}>신청 상세</h1>
        <p className={styles.pageDescription}>학생의 상담부터 등록까지의 과정을 한눈에 확인할 수 있습니다.</p>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p><StudioQueryRetry />
        </section>
      ) : null}

      {data && detailView ? (
        <>
          <ApplicationTrialResultWorkflow
            application={data}
            headerContent={
              <div className={styles.caseHeader}>
                <div className={styles.caseHeaderTop}>
                  <div className={styles.caseIdentity}>
                    <div className={styles.identityLine}>
                      <h2 className={styles.caseTitle}>{data.childName}<span className={styles.caseTitleSub}>{detailView.childGrade ? `· ${detailView.childGrade}` : ""}</span></h2>
                      <StudioStatusBadge tone={data.status === "canceled" ? "red" : "green"}>
                        {detailView.caseStageLabel}
                      </StudioStatusBadge>
                    </div>
                    <p className={styles.caseSubline}>{detailView.classTitle}{data.academyName ? ` · ${data.academyName}` : ""}</p>
                    <p className={styles.caseGuardian}>
                      {detailView.confirmedSchedule ? `${detailView.confirmedSchedule} · 확정` : `희망 · ${detailView.requestedSchedule}`}
                    </p>
                  </div>
                  <div className={styles.headerControls}>
                    <div className={styles.caseActions}>
                      {detailView.phoneHref ? <a href={detailView.phoneHref} className={styles.actionButtonTint}>전화하기</a> : null}
                      {detailView.smsHref ? <a href={detailView.smsHref} className={styles.actionButtonSecondary}>문자하기</a> : null}
                      {data.classId ? <details className={styles.moreDisclosure}>
                        <summary aria-label="더보기">더보기</summary>
                        <Link href={getParentCrossProductHref({ pathname: `/classes/${data.classId}`, hostname })} className={styles.caseInlineLink}>수업 미리보기</Link>
                      </details> : null}
                    </div>
                    <div className={styles.teacherBlock}>
                      <div><span className={styles.summaryLabel}>담당 선생님</span><p>{data.assignedTeacherName ?? "미배정"}</p></div>
                      <details id="case-assignee" className={styles.assigneeDisclosure}>
                        <summary>변경</summary>
                        <ApplicationAssigneeForm
                          applicationId={data.id}
                          currentAssignedTeacherId={data.assignedTeacherId}
                          currentAssignedTeacherName={data.assignedTeacherName}
                          options={assigneeOptionsResult.data}
                          optionsError={assigneeOptionsResult.error}
                          defaultExpanded
                        />
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            }
            evidence={{
              trialResultError: data.trialResultLoadError ?? null,
              report: {
                error: publishedReportResult.error,
                version: reportView?.published?.version ?? null,
                publishedAt: reportView?.published?.publishedAt ?? null,
                changed: reportView?.assessmentChangedSincePublish ?? false,
                canPublish: Boolean(entitlements.canPublishParentReport && reportView?.preview && reportView.assessmentUpdatedAt && !publishedReportResult.error && reportView.blockers.length === 0)
              },
              parentDecision: { error: parentDecisionResult.error, value: parentDecisionResult.data?.decision ?? null, createdAt: parentDecisionResult.data?.createdAt ?? null },
              registration: { error: registrationResult.error, result: registrationResult.data?.result ?? null, resolvedAt: registrationResult.data?.resolvedAt ?? null }
            }}
            nowIso={nowIso}
            canWriteTrialResults={entitlements.canWriteTrialResults}
            canWriteConsultations={entitlements.canWriteConsultations}
            canReopenConsultation={entitlements.canReopenConsultation}
            parentDecisionSection={
              <StudioParentDecision
                key="parent-decision"
                decision={parentDecisionResult.data}
                loadError={parentDecisionResult.error}
              />
            }
            reportSection={
              reportView &&
              (reportView.preview ||
                reportView.published ||
                reportView.publishedReportLoadError ||
                reportView.blockers.length > 0) ? (
                <ApplicationReportPublishing
                  key="parent-report"
                  embedded
                  emphasizePublish={(!reportView.published || reportView.assessmentChangedSincePublish) && data.status === "completed" && data.registrationStatus !== "enrolled" && data.registrationStatus !== "not_enrolled" && !registrationResult.data && !registrationResult.error}
                  applicationId={data.id}
                  preview={reportView.preview}
                  publishedSnapshot={reportView.published?.content ?? null}
                  publishedVersion={reportView.published?.version ?? null}
                  publishedAt={reportView.published?.publishedAt ?? null}
                  publishedReportLoadError={reportView.publishedReportLoadError}
                  assessmentUpdatedAt={reportView.assessmentUpdatedAt}
                  assessmentChangedSincePublish={reportView.assessmentChangedSincePublish}
                  blockers={reportView.blockers}
                  canPublishReport={entitlements.canPublishParentReport}
                />
              ) : null
            }
            referenceSections={
              <section className={styles.applicationInfoSection} aria-label="신청 참고 정보">
                <h2 className={styles.applicationInfoTitle}>신청 참고 정보</h2>
                <dl className={styles.referenceGrid}>
                  {[
                    { label: "관심 과목", value: detailView.classSubject },
                    { label: "학습 수준", value: detailView.currentLevel },
                    { label: "신청 시 희망 일정", value: detailView.normalizedPreferredRegularSchedule },
                    { label: "학생 메모", value: detailView.childNotes },
                    { label: "학부모 메모", value: detailView.parentMemo },
                    { label: "희망 사항", value: detailView.normalizedGoalNote }
                  ].filter(item => item.value).map(item => <div key={item.label} className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>{item.label}</dt><dd className={styles.summaryValueMultiline}>{item.value}</dd>
                  </div>)}
                </dl>
                <p className={styles.referenceHint}>신청 당시 입력한 정보입니다.</p>
              </section>
            }
            sidebarContent={<>
        <section key="basic-info" className={styles.applicationInfoSection} aria-labelledby="application-info-title">
            <div className={styles.applicationInfoHeader}>
              <h2 id="application-info-title" className={styles.applicationInfoTitle}>
                학생 / 학부모 정보
              </h2>
            </div>
            <div className={styles.applicationInfoBody}>
              <dl className={styles.applicationInfoGrid}>
                <div className={styles.infoCell}><dt className={styles.summaryLabel}>학생</dt><dd className={styles.summaryValue}>{data.childName}{detailView.childGrade ? ` · ${detailView.childGrade}` : ""}</dd></div>
                {detailView.parentName ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>보호자</dt>
                    <dd className={styles.summaryValue}>{detailView.parentName}</dd>
                  </div>
                ) : null}
                {detailView.parentPhone ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>연락처</dt>
                    <dd className={styles.summaryValueStrong}>{detailView.parentPhone}</dd>
                  </div>
                ) : null}
                <div className={styles.infoCell}>
                  <dt className={styles.summaryLabel}>신청일</dt>
                  <dd className={styles.summaryValue}>{detailView.applicationDateDetail}</dd>
                </div>


                {detailView.childSchool ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>학교</dt>
                    <dd className={styles.summaryValue}>{detailView.childSchool}</dd>
                  </div>
                ) : null}
              </dl>




            </div>
        </section>
        <section id="detail-trial-schedule" key="trial-schedule" className={styles.applicationInfoSection} aria-label="체험 일정">
          <div className={styles.scheduleHead}><h2 className={styles.applicationInfoTitle}>체험 일정</h2>
            <StudioStatusBadge tone={data.status === "canceled" ? "red" : detailView.confirmedSchedule ? "green" : "gray"}>
              {data.status === "canceled" ? detailView.caseStageLabel : data.status === "completed" ? "완료" : detailView.confirmedSchedule ? "확정" : "미확정"}
            </StudioStatusBadge>
          </div>
          <p className={styles.scheduleDate}>{detailView.confirmedSchedule ?? `희망 · ${detailView.requestedSchedule}`}</p>
          <Link href={studioPath("/studio/schedule")} className={styles.caseInlineLink}>일정 관리 →</Link>
        </section></>
            }
          />
        </>
      ) : null}
    </div>
  )
}
