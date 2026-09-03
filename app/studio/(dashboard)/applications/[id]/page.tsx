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
import { ApplicationTrialResultWorkflow } from "@/features/studio/ui/application-trial-result-workflow"
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"
import { getSubjectLabel } from "@/shared/constants/education-taxonomy"
import { getSeoulDateTimeParts, SEOUL_TIME_ZONE } from "@/shared/lib/seoul-datetime"

import styles from "./page.module.css"

type StudioApplicationDetailPageProps = {
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

export default async function StudioApplicationDetailPage({ params }: StudioApplicationDetailPageProps) {
  const teacher = await requireTeacherStudioAccess()
  const resolvedParams = await params
  const { data, error } = await getStudioApplicationDetail(resolvedParams.id, teacher.organizationId)
  const assigneeOptionsResult = data
    ? await getStudioApplicationAssigneeOptions(teacher.organizationId)
    : { data: [], error: null }

  if (!error && !data) {
    notFound()
  }

  // 서버가 정한 한 시각을 이 화면 전체가 공유한다(단계 표시와 다음 할 일이 같은 시각을 본다).
  const nowIso = new Date().toISOString()
  const detailView = data
    ? (() => {
        const requestedSchedule =
          normalizeText(data.selectedScheduleLabel) ??
          resolveScheduleSummary(data.requestedSlotAt, null, null).primary
        const confirmedSchedule = data.confirmedSlotAt
          ? resolveScheduleSummary(data.requestedSlotAt, data.confirmedSlotAt, data.selectedScheduleLabel).primary
          : null
        const applicationDate = formatDateTime(data.createdAt) ?? "신청일 미기록"
        const applicationDateDetail = formatDateWithWeekdayTime(data.createdAt, { hour12: true }) ?? applicationDate
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
        // 확정 체험의 종료 시각이 지났으면 표시만 "체험 완료" 로 앞당긴다(DB 는 confirmed 그대로).
        const caseStage = getCaseDisplayStage({
          status: data.status,
          noShowAt: data.noShowAt,
          registrationStatus: data.registrationStatus,
          confirmedSlotAt: data.confirmedSlotAt,
          scheduleStartTime: data.scheduleStartTime,
          scheduleEndTime: data.scheduleEndTime
        }, new Date(nowIso))
        const closedStep =
          caseStage === "enrolled"
            ? { label: "등록", at: data.enrolledAt }
            : caseStage === "not_enrolled"
              ? { label: "미등록", at: data.lostAt }
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
          registrationTone,
          registrationLabel,
          statusLabel,
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
          <Link href="/studio/cases" className={styles.backLink}>
            상담·등록으로 돌아가기
          </Link>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {data && detailView ? (
        <>
          {/* 1. Case Header — 상태와 관계없이 항상 같은 구조다. */}
          <section className={styles.caseHeader} aria-label="Case 요약">
            <div className={styles.caseHeaderTop}>
              <div className={styles.caseIdentity}>
                <h1 className={styles.caseTitle}>
                  {data.childName}
                  {detailView.childGrade ? (
                    <span className={styles.caseTitleSub}>· {detailView.childGrade}</span>
                  ) : null}
                </h1>

                <p className={styles.caseSubline}>
                  <span className={styles.caseClassName}>{detailView.classTitle}</span>
                  {data.classId ? (
                    <Link href={`/classes/${data.classId}`} className={styles.caseInlineLink}>
                      미리보기
                    </Link>
                  ) : null}
                  <span className={styles.caseDivider}>·</span>
                  담당 {data.assignedTeacherName ?? "미배정"}
                </p>

                <p className={styles.caseGuardian}>
                  보호자 {detailView.parentName ?? "미기록"}
                  {detailView.parentPhone ? (
                    <>
                      <span className={styles.caseDivider}>·</span>
                      {detailView.parentPhone}
                    </>
                  ) : null}
                </p>
              </div>

              <div className={styles.caseBadgeWrap}>
                <StudioStatusBadge tone={detailView.registrationTone}>
                  {detailView.registrationLabel}
                </StudioStatusBadge>
              </div>
            </div>

            {detailView.phoneHref || detailView.smsHref ? (
              <div className={styles.caseActions}>
                {detailView.phoneHref ? (
                  <a href={detailView.phoneHref} className={styles.actionButtonTint}>
                    전화 걸기
                  </a>
                ) : null}
                {detailView.smsHref ? (
                  <a href={detailView.smsHref} className={styles.actionButtonSecondary}>
                    문자
                  </a>
                ) : null}
              </div>
            ) : null}

            {/* 큰 Stepper 를 대신하는 컴팩트 진행 상태. */}
            <div className={styles.progressStrip}>
              <span className={styles.progressLabel}>진행 상태</span>
              {detailView.progressSteps.length > 0 ? (
                <span className={styles.progressSteps}>{detailView.progressSteps.join("  ·  ")}</span>
              ) : null}
              <span className={styles.progressCurrent}>현재 · {detailView.caseStageLabel}</span>
            </div>
          </section>

          {/* 2. 신청 정보 — 일정 판단 전에 별도 펼침 없이 읽을 수 있어야 한다. */}
          <section className={styles.applicationInfoSection} aria-labelledby="application-info-title">
            <div className={styles.applicationInfoHeader}>
              <h2 id="application-info-title" className={styles.applicationInfoTitle}>
                신청 정보
              </h2>
            </div>
            <div className={styles.applicationInfoBody}>
              <dl className={styles.applicationInfoGrid}>
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
                <div className={styles.infoCell}>
                  <dt className={styles.summaryLabel}>신청 수업</dt>
                  <dd className={styles.summaryValue}>{detailView.classTitle}</dd>
                </div>
                <div className={styles.infoCell}>
                  <dt className={styles.summaryLabel}>신청 유형 / 과목</dt>
                  <dd className={styles.summaryValue}>
                    {detailView.programTypeLabel}
                    {detailView.classSubject ? ` · ${detailView.classSubject}` : ""}
                  </dd>
                </div>
                <div className={styles.infoCell}>
                  <dt className={styles.summaryLabel}>희망 일정</dt>
                  <dd className={styles.summaryValue}>
                    {detailView.requestedSchedule}
                    <Link href="/studio/schedule" className={styles.caseInlineLink}>
                      일정 관리
                    </Link>
                  </dd>
                </div>
                {detailView.confirmedSchedule ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>확정 일정</dt>
                    <dd className={styles.summaryValue}>{detailView.confirmedSchedule}</dd>
                  </div>
                ) : null}
                {detailView.childSchool ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>학교</dt>
                    <dd className={styles.summaryValue}>{detailView.childSchool}</dd>
                  </div>
                ) : null}
                {detailView.currentLevel ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>현재 수준</dt>
                    <dd className={styles.summaryValue}>{detailView.currentLevel}</dd>
                  </div>
                ) : null}
                {detailView.classRegion ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>지역</dt>
                    <dd className={styles.summaryValue}>{detailView.classRegion}</dd>
                  </div>
                ) : null}
                {detailView.normalizedPreferredRegularSchedule ? (
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>선호 정규 일정</dt>
                    <dd className={styles.summaryValue}>{detailView.normalizedPreferredRegularSchedule}</dd>
                  </div>
                ) : null}
                {detailView.childNotes ? (
                  <div className={`${styles.infoCell} ${styles.infoCellWide}`}>
                    <dt className={styles.summaryLabel}>학생 메모</dt>
                    <dd className={styles.summaryValueMultiline}>{detailView.childNotes}</dd>
                  </div>
                ) : null}
                {detailView.parentMemo ? (
                  <div className={`${styles.infoCell} ${styles.infoCellWide}`}>
                    <dt className={styles.summaryLabel}>학부모 메모</dt>
                    <dd className={styles.summaryValueMultiline}>{detailView.parentMemo}</dd>
                  </div>
                ) : null}
                {detailView.normalizedGoalNote ? (
                  <div className={`${styles.infoCell} ${styles.infoCellWide}`}>
                    <dt className={styles.summaryLabel}>상담 목표</dt>
                    <dd className={styles.summaryValueMultiline}>{detailView.normalizedGoalNote}</dd>
                  </div>
                ) : null}
              </dl>

              <ApplicationAssigneeForm
                applicationId={data.id}
                currentAssignedTeacherId={data.assignedTeacherId}
                currentAssignedTeacherName={data.assignedTeacherName}
                options={assigneeOptionsResult.data}
                optionsError={assigneeOptionsResult.error}
              />
            </div>
          </section>

          {/* 3. 다음 할 일  4. 활동 기록  5. 체험 결과 */}
          <ApplicationTrialResultWorkflow application={data} nowIso={nowIso} />
        </>
      ) : null}
    </div>
  )
}
