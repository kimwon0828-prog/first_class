import Link from "next/link"
import { notFound } from "next/navigation"

import {
  getStudioDisplayStatus,
  getStudioRegistrationStatusLabel,
  getStudioStatusLabel,
  STUDIO_APPLICATION_STATUS_LABELS
} from "@/features/studio/lib/application-status-labels"
import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getStudioApplicationAssigneeOptions } from "@/features/studio/queries/get-studio-application-assignee-options"
import { getStudioApplicationDetail } from "@/features/studio/queries/get-studio-application-detail"
import { ApplicationAssigneeForm } from "@/features/studio/ui/application-assignee-form"
import { ApplicationOutcomeForm } from "@/features/studio/ui/application-outcome-form"
import { ApplicationRegistrationStatusSection } from "@/features/studio/ui/application-registration-status-section"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import type { ApplicationStatus, StudioApplicationSummary } from "@/shared/lib/db/adapter"

import styles from "./page.module.css"

type StudioApplicationDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

const formatDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date)
}

const resolveScheduleSummary = (
  requestedSlotAt: string,
  confirmedSlotAt: string | null,
  selectedLabel?: string | null
) => {
  const confirmedAt = confirmedSlotAt ? formatDateTime(confirmedSlotAt) : null
  const requestedAt = requestedSlotAt ? formatDateTime(requestedSlotAt) : null
  const normalizedSelectedLabel = selectedLabel?.trim() ? selectedLabel.trim() : null

  if (confirmedAt) {
    return {
      primary: confirmedAt,
      secondary:
        normalizedSelectedLabel && normalizedSelectedLabel !== confirmedAt
          ? `선택 시간: ${normalizedSelectedLabel}`
          : null
    }
  }

  if (requestedAt) {
    return {
      primary: requestedAt,
      secondary:
        normalizedSelectedLabel && normalizedSelectedLabel !== requestedAt
          ? `선택 시간: ${normalizedSelectedLabel}`
          : null
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

const getRegistrationBadge = (registrationStatus: string, status: ApplicationStatus) => {
  if (registrationStatus === "enrolled") {
    return { label: getStudioRegistrationStatusLabel("enrolled"), tone: "successSolid" as const }
  }

  if (registrationStatus === "pending") {
    return { label: getStudioRegistrationStatusLabel("pending"), tone: "warningSoft" as const }
  }

  if (registrationStatus === "not_enrolled") {
    return { label: getStudioRegistrationStatusLabel("not_enrolled"), tone: "neutralSoft" as const }
  }

  if (status === "completed" && registrationStatus === "undecided") {
    return { label: getStudioRegistrationStatusLabel("undecided"), tone: "neutralSoft" as const }
  }

  return { label: "등록 미기록", tone: "neutralSoft" as const }
}

const getStatusBadge = (application: Pick<StudioApplicationSummary, "status" | "noShowAt">) => {
  const displayStatus = getStudioDisplayStatus(application)

  if (displayStatus === "new") {
    return { label: STUDIO_APPLICATION_STATUS_LABELS.new, tone: "successSoft" as const }
  }

  if (displayStatus === "reviewing") {
    return { label: STUDIO_APPLICATION_STATUS_LABELS.reviewing, tone: "warningSoft" as const }
  }

  if (displayStatus === "confirmed") {
    return { label: STUDIO_APPLICATION_STATUS_LABELS.confirmed, tone: "infoSoft" as const }
  }

  if (displayStatus === "completed") {
    return { label: STUDIO_APPLICATION_STATUS_LABELS.completed, tone: "neutralSoft" as const }
  }

  if (displayStatus === "no_show") {
    return { label: STUDIO_APPLICATION_STATUS_LABELS.no_show, tone: "dangerSoft" as const }
  }

  return { label: STUDIO_APPLICATION_STATUS_LABELS.canceled, tone: "dangerSoft" as const }
}

const TIMELINE_STEPS = [
  { key: "new", label: "신청", fallbackLabel: "신규 신청" },
  { key: "confirmed", label: "수업 확정", fallbackLabel: "수업 확정" },
  { key: "completed", label: "체험 완료", fallbackLabel: "체험 완료" },
  { key: "registration", label: "등록 결정", fallbackLabel: "등록 결정" }
] as const

const formatLogTime = (value: string | null | undefined) => {
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
    hour: "numeric",
    minute: "2-digit"
  }).format(date)
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
    | "successSolid"
}) => {
  return <span className={`${styles.badge} ${styles[`badge_${tone}`]}`}>{label}</span>
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

  const detailView = data
    ? (() => {
        const scheduleSummary = resolveScheduleSummary(
          data.requestedSlotAt,
          data.confirmedSlotAt,
          data.selectedScheduleLabel
        )
        const applicationDate = formatDateTime(data.createdAt) ?? "신청일 미기록"
        const statusBadge = getStatusBadge(data)
        const registrationBadge = getRegistrationBadge(data.registrationStatus, data.status)
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
        const classSubject = normalizeText(data.classSubject)
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
        const nextActionDescription =
          data.status === "new" || data.status === "reviewing"
            ? "담당 선생님과 일정을 확인한 뒤 수업 확정으로 넘겨 주세요."
            : data.status === "confirmed"
              ? "체험 진행이 끝나면 체험 완료 처리하거나, 노쇼/일정 변경 여부를 정리해 주세요."
              : data.status === "completed"
                ? "등록 결과와 후속 메모를 기록해 등록 전환을 마무리해 주세요."
                : statusLabel === "노쇼"
                  ? "노쇼로 종료된 신청입니다. 필요한 메모만 정리해 주세요."
                  : "종료된 신청입니다. 이력과 메모만 확인할 수 있습니다."
        const phoneHref = parentPhone ? `tel:${parentPhone}` : null
        const smsHref = parentPhone ? `sms:${parentPhone}` : null
        const timelineDateByStep: Record<(typeof TIMELINE_STEPS)[number]["key"], string | null> = {
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

        return {
          scheduleSummary,
          applicationDate,
          statusBadge,
          registrationBadge,
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
          nextActionDescription,
          phoneHref,
          smsHref,
          timelineDateByStep,
          currentTimelineIndex,
          isTerminalCanceled
        }
      })()
    : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTopRow}>
          <Link href="/studio/applications" className={styles.backLink}>
            신청/상담 관리로 돌아가기
          </Link>
        </div>

        <div className={styles.headerTitleRow}>
          <div>
            <h1 className={styles.title}>체험신청 상세</h1>
            <p className={styles.subtitle}>신청 정보를 확인하고 상담 상태를 관리해요.</p>
          </div>
        </div>
      </header>

      {error ? (
        <section className={styles.errorCard} role="alert">
          <p className={styles.errorText}>{error}</p>
        </section>
      ) : null}

      {data && detailView ? (
        <>
          <section className={styles.summaryCard} aria-label="신청 요약">
            <div className={styles.summaryTop}>
              <div className={styles.heroBody}>
                <div className={styles.heroIdentity}>
                  <h2 className={styles.summaryTitle}>
                    {data.childName}
                    {detailView.childGrade ? (
                      <span className={styles.summaryTitleSub}>{detailView.childGrade}</span>
                    ) : null}
                  </h2>
                  <p className={styles.summarySubtitle}>
                    {detailView.parentName ?? "보호자 미기록"}
                    <span className={styles.summaryDivider}>·</span>
                    {detailView.programTypeLabel}
                    <span className={styles.summaryDivider}>·</span>
                    {detailView.classTitle}
                  </p>
                </div>

                <div className={styles.badgeRow}>
                  <Badge label={detailView.statusBadge.label} tone={detailView.statusBadge.tone} />
                  <Badge
                    label={detailView.registrationBadge.label}
                    tone={detailView.registrationBadge.tone}
                  />
                </div>
              </div>

              <div className={styles.summaryActions}>
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
                {data.classId ? (
                  <Link href={`/classes/${data.classId}`} className={styles.actionButtonSecondary}>
                    수업 미리보기
                  </Link>
                ) : null}
                <Link href="/studio/schedule" className={styles.actionButtonSecondary}>
                  일정 관리
                </Link>
              </div>
            </div>
          </section>

          <section className={styles.timelineCard} aria-label="상태 타임라인">
            <div className={styles.sectionHeading}>
              <div>
                <h2 className={styles.sectionTitle}>상태 타임라인</h2>
                <p className={styles.sectionDescription}>
                  신청부터 등록 결정까지 현재 진행 단계를 한눈에 확인해요.
                </p>
              </div>
              {detailView.isTerminalCanceled ? (
                <span className={styles.terminalNotice}>
                  {detailView.statusLabel}로 종료된 신청입니다.
                </span>
              ) : null}
            </div>

            <div className={styles.timelineScroller}>
              <ol className={styles.timelineList}>
                {TIMELINE_STEPS.map((step, index) => {
                  const isRegistrationStep = step.key === "registration"
                  const isDone = detailView.isTerminalCanceled
                    ? index <= detailView.currentTimelineIndex
                    : isRegistrationStep
                      ? data.registrationStatus !== "undecided"
                      : index <= detailView.currentTimelineIndex
                  const isCurrent =
                    !detailView.isTerminalCanceled &&
                    !isRegistrationStep &&
                    index === detailView.currentTimelineIndex
                  const nodeLabel = isCurrent ? `${index + 1}` : isDone ? "✓" : `${index + 1}`
                  const timeText = formatLogTime(detailView.timelineDateByStep[step.key])
                  return (
                    <li
                      key={step.key}
                      className={`${styles.timelineItem} ${isDone ? styles.timelineItemDone : ""} ${
                        isCurrent ? styles.timelineItemCurrent : ""
                      }`}
                    >
                      <div className={styles.timelineIconRow} aria-hidden="true">
                        <div className={styles.timelineConnector} />
                        <div className={styles.timelineNode} aria-current={isCurrent ? "step" : undefined}>
                          {nodeLabel}
                        </div>
                      </div>
                      <div className={styles.timelineTextRow}>
                        <p className={styles.timelineLabel}>{step.label}</p>
                        <p className={styles.timelineMeta}>{timeText ?? step.fallbackLabel}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          </section>

          <div className={styles.body}>
            <section className={styles.main} aria-label="처리 영역">
              <section className={styles.card} aria-label="다음에 할 일">
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 className={styles.sectionTitle}>다음에 할 일</h2>
                    <p className={styles.sectionDescription}>{detailView.nextActionDescription}</p>
                  </div>
                </div>

                <div className={styles.todoBody}>
                  {data.status === "canceled" ? (
                    <div className={styles.todoNotice}>이미 종료된 신청이라 추가 상태 변경은 필요하지 않습니다.</div>
                  ) : (
                    <ApplicationStatusActionForm applicationId={data.id} currentStatus={data.status} />
                  )}
                </div>
              </section>

              <section className={styles.card} aria-label="신청 정보">
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 className={styles.sectionTitle}>신청 정보</h2>
                    <p className={styles.sectionDescription}>확정 일정과 보호자 연락처를 먼저 확인해 주세요.</p>
                  </div>
                </div>

                <dl className={styles.infoGrid}>
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>{data.confirmedSlotAt ? "확정 일정" : "희망 일정"}</dt>
                    <dd className={styles.summaryValue}>
                      {detailView.scheduleSummary.primary}
                      {detailView.scheduleSummary.secondary ? (
                        <>
                          <br />
                          {detailView.scheduleSummary.secondary}
                        </>
                      ) : null}
                    </dd>
                  </div>
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>보호자 연락처</dt>
                    <dd className={styles.summaryValueStrong}>{detailView.parentPhone ?? "미기록"}</dd>
                  </div>
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>신청일</dt>
                    <dd className={styles.summaryValue}>{detailView.applicationDate}</dd>
                  </div>
                  <div className={styles.infoCell}>
                    <dt className={styles.summaryLabel}>신청 유형 / 과목</dt>
                    <dd className={styles.summaryValue}>
                      {detailView.programTypeLabel}
                      {detailView.classSubject ? ` · ${detailView.classSubject}` : ""}
                    </dd>
                  </div>
                </dl>

                <details className={styles.foldCard}>
                  <summary className={styles.foldSummary}>추가 정보 보기</summary>
                  <dl className={styles.extraInfoGrid}>
                    <div className={styles.infoCell}>
                      <dt className={styles.summaryLabel}>학교</dt>
                      <dd className={styles.summaryValue}>{detailView.childSchool ?? "미기록"}</dd>
                    </div>
                    <div className={styles.infoCell}>
                      <dt className={styles.summaryLabel}>현재 수준</dt>
                      <dd className={styles.summaryValue}>{detailView.currentLevel ?? "미기록"}</dd>
                    </div>
                    <div className={styles.infoCell}>
                      <dt className={styles.summaryLabel}>지역</dt>
                      <dd className={styles.summaryValue}>{detailView.classRegion ?? "미기록"}</dd>
                    </div>
                    <div className={styles.infoCell}>
                      <dt className={styles.summaryLabel}>선호 정규 일정</dt>
                      <dd className={styles.summaryValue}>
                        {detailView.normalizedPreferredRegularSchedule ?? "미기록"}
                      </dd>
                    </div>
                    <div className={`${styles.infoCell} ${styles.infoCellWide}`}>
                      <dt className={styles.summaryLabel}>학생 메모</dt>
                      <dd className={styles.summaryValueMultiline}>{detailView.childNotes ?? "미기록"}</dd>
                    </div>
                    <div className={`${styles.infoCell} ${styles.infoCellWide}`}>
                      <dt className={styles.summaryLabel}>학부모 메모</dt>
                      <dd className={styles.summaryValueMultiline}>{detailView.parentMemo ?? "미기록"}</dd>
                    </div>
                    <div className={`${styles.infoCell} ${styles.infoCellWide}`}>
                      <dt className={styles.summaryLabel}>상담 목표</dt>
                      <dd className={styles.summaryValueMultiline}>
                        {detailView.normalizedGoalNote ?? "미기록"}
                      </dd>
                    </div>
                  </dl>
                </details>
              </section>

              <ApplicationOutcomeForm item={data} formId="application-outcome-form" />
            </section>

            <aside className={styles.side} aria-label="우측 작업 영역">
              <div className={styles.sticky}>
                <ApplicationRegistrationStatusSection
                  formId="application-outcome-form"
                  currentRegistrationStatus={data.registrationStatus}
                  isCompleted={data.status === "completed"}
                />

                <ApplicationAssigneeForm
                  applicationId={data.id}
                  currentAssignedTeacherId={data.assignedTeacherId}
                  currentAssignedTeacherName={data.assignedTeacherName}
                  options={assigneeOptionsResult.data}
                  optionsError={assigneeOptionsResult.error}
                />

                <section className={styles.card} aria-label="처리 이력">
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2 className={styles.sectionTitle}>처리 이력</h2>
                      <p className={styles.sectionDescription}>상태 변경과 메모 저장 이력을 최근 순으로 보여줘요.</p>
                    </div>
                  </div>

                  {data.logs.length > 0 ? (
                    <ul className={styles.historyList}>
                      {data.logs.map((log) => (
                        <li key={log.id} className={styles.historyItem}>
                          <div className={styles.historyTime}>{formatLogTime(log.createdAt) ?? "시각 미기록"}</div>
                          <div className={styles.historyContent}>
                            <p className={styles.historyTitle}>{log.note ?? "처리 기록"}</p>
                            <p className={styles.historyMeta}>{log.actorName ?? "시스템"}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.emptyText}>아직 저장된 처리 이력이 없습니다.</p>
                  )}
                </section>
              </div>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  )
}
