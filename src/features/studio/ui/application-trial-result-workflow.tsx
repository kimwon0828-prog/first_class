"use client"

import type { ReactNode } from "react"
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createConsultationLogAction,
  type CreateConsultationLogActionState
} from "@/features/studio/actions/create-consultation-log"
import { buildCaseActivityEvents } from "@/features/studio/lib/case-activity"
import { getTrialCompletionState } from "@/features/studio/lib/trial-completion"
import {
  CONSULTATION_CHANNEL_OPTIONS,
  CONSULTATION_SENTIMENT_OPTIONS,
  getConsultationChannelLabel,
  getConsultationSentimentLabel
} from "@/features/studio/lib/consultation-log-options"
import {
  formatSeoulDateTime
} from "@/features/studio/lib/seoul-datetime"
import {
  upsertTrialResultAction,
  type UpsertTrialResultActionState
} from "@/features/studio/actions/upsert-trial-result"
import {
  getTrialResultUnregisteredReasonLabel,
  TRIAL_RESULT_OBSERVATION_OPTIONS,
  TRIAL_RESULT_REGISTRATION_OPTIONS,
  TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS
} from "@/features/studio/lib/trial-result-options"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import { ConsultationHistoryModal } from "@/features/studio/ui/consultation-history-modal"
import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  ConsultationSentiment,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

import styles from "./application-trial-result-workflow.module.css"

const initialTrialResultState: UpsertTrialResultActionState = {
  status: "idle",
  message: "",
  successToken: null
}

const initialConsultationState: CreateConsultationLogActionState = {
  status: "idle",
  message: "",
  successToken: null
}

type ApplicationTrialResultWorkflowProps = {
  application: StudioApplicationDetail
  sidebarContent?: ReactNode
  /** 서버가 정한 기준 시각. 체험 종료 판정이 hydration 전후로 갈리지 않게 한다. */
  nowIso: string
}

type NextActionState = {
  title: string
  description: string | null
  tone: "default" | "warning" | "success"
  actionLabel?: string
  actionType?: "trial_result" | "consultation"
}

const getCompletedNextActionState = (application: StudioApplicationDetail): NextActionState => {
  const hasConsultationHistory = application.consultationLogs.length > 0
  const nextContactAt = application.nextContactAt

  if (!application.trialResult) {
    return {
      title: "체험 결과를 먼저 기록해 주세요.",
      description: "체험 직후 1회 기록이 먼저 있어야 이후 상담 흐름을 이어갈 수 있습니다.",
      tone: "warning",
      actionLabel: "체험 결과 기록",
      actionType: "trial_result"
    }
  }

  if (application.registrationStatus === "enrolled") {
    return {
      title: "등록이 완료되었습니다.",
      description: null,
      tone: "success"
    }
  }

  if (application.registrationStatus === "not_enrolled") {
    return {
      title: "미등록으로 종료되었습니다.",
      description: null,
      tone: "default"
    }
  }

  if (nextContactAt) {
    const nextContactLabel = formatSeoulDateTime(nextContactAt)
    if (new Date(nextContactAt).getTime() <= Date.now()) {
      return {
        title: "연락할 시간이 되었어요.",
        description: nextContactLabel ? `다음 연락 예정 ${nextContactLabel}` : null,
        tone: "warning"
      }
    }

    return {
      title: "다음 연락",
      description: nextContactLabel,
      tone: "default"
    }
  }

  if (!hasConsultationHistory) {
    return {
      title: "상담 기록이 필요해요.",
      description: "첫 상담 내용을 남기면 다음 연락 일정과 등록 전환 흐름을 이어서 관리할 수 있습니다.",
      tone: "warning",
      actionLabel: "상담 기록 추가",
      actionType: "consultation"
    }
  }

  return {
    title: "다음 연락 일정이 없습니다.",
    description: "다음 연락 예정이 비어 있어 후속 관리가 필요합니다.",
    tone: "warning",
    actionLabel: "상담 기록 추가",
    actionType: "consultation"
  }
}

const getNextActionState = (application: StudioApplicationDetail, now: Date): NextActionState => {
  if (application.status === "new" || application.status === "reviewing") {
    const requestedScheduleLabel =
      application.selectedScheduleLabel?.trim() ||
      formatSeoulDateTime(application.requestedSlotAt) ||
      "희망 일정 확인 필요"

    return {
      title: requestedScheduleLabel,
      description: "체험수업 일정으로 확정할까요?",
      tone: "default"
    }
  }

  if (application.status === "confirmed") {
    const scheduleAt = application.confirmedSlotAt ?? application.requestedSlotAt
    // "끝났는가" 는 trial-completion 하나만 판단한다. 여기서 다시 계산하지 않는다.
    // 종료 시각을 모르면(unknown) 끝났다고 말하지 않고 예정 문구를 유지한다.
    const completion = getTrialCompletionState(
      {
        confirmedSlotAt: application.confirmedSlotAt,
        scheduleStartTime: application.scheduleStartTime,
        scheduleEndTime: application.scheduleEndTime
      },
      now
    )

    return {
      title:
        completion === "ended"
          ? "체험 완료 처리 후 결과를 기록해 주세요."
          : `${formatSeoulDateTime(scheduleAt) ?? "확정된 일정"} 체험수업 예정`,
      description: null,
      tone: "default"
    }
  }

  if (application.status === "completed") {
    return getCompletedNextActionState(application)
  }

  return {
    title:
      application.status === "canceled"
        ? "이미 종료된 신청이라 추가 상태 변경은 필요하지 않습니다."
        : "종료된 신청입니다. 이력만 확인할 수 있습니다.",
    description: null,
    tone: "default"
  }
}

const formatMonthDay = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

const getCompletedDaysSinceLabel = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const elapsed = Math.max(0, Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24)))
  return `${elapsed}일`
}

const getCompletedTodoCardCopy = (
  application: StudioApplicationDetail,
  hasConsultationHistory: boolean
): { title: string; description: string | null } => {
  if (!application.trialResult) {
    return {
      title: "체험 결과가 아직 기록되지 않았어요.",
      description: "수업에서 관찰한 내용을 먼저 남기면 이후 상담 흐름을 이어갈 수 있어요."
    }
  }

  if (application.registrationStatus === "enrolled") {
    return {
      title: "등록이 완료된 신청이에요.",
      description: "후속 상담은 종료되었고, 현재 상태만 확인할 수 있어요."
    }
  }

  if (application.registrationStatus === "not_enrolled") {
    return {
      title: "미등록으로 종료된 신청이에요.",
      description: "추가 상담 대신 현재까지 기록만 확인해 주세요."
    }
  }

  if (application.nextContactAt && new Date(application.nextContactAt).getTime() <= Date.now()) {
    return {
      title: "다시 연락할 시간이 지났어요.",
      description: formatSeoulDateTime(application.nextContactAt)
    }
  }

  if (!application.nextContactAt && !hasConsultationHistory) {
    return {
      title: "첫 상담 기록을 남겨 주세요.",
      description: "체험 직후 반응을 남겨 두면 다음 연락 흐름을 이어서 관리할 수 있어요."
    }
  }

  if (!application.nextContactAt) {
    return {
      title: "다음 연락 일정이 없어요.",
      description: application.lastActivityAt
        ? `${formatMonthDay(application.lastActivityAt) ?? "최근"} 상담 이후 후속 일정이 비어 있어요.`
        : "다음 연락 일정을 정해 두면 후속 관리가 쉬워져요."
    }
  }

  return {
    title: "다음 연락이 예정되어 있어요.",
    description: formatSeoulDateTime(application.nextContactAt)
  }
}

export const ApplicationTrialResultWorkflow = ({
  application,
  sidebarContent = null,
  nowIso
}: ApplicationTrialResultWorkflowProps) => {
  const router = useRouter()
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [refreshOnEditorClose, setRefreshOnEditorClose] = useState(false)
  const [selectedObservations, setSelectedObservations] = useState<string[]>(
    application.trialResult?.observations ?? []
  )
  const [selectedRegistrationStatus, setSelectedRegistrationStatus] =
    useState<ApplicationRegistrationStatus>(application.registrationStatus)
  const [selectedUnregisteredReason, setSelectedUnregisteredReason] =
    useState<ApplicationUnregisteredReason | null>(application.unregisteredReason ?? null)
  const [unregisteredReasonNote, setUnregisteredReasonNote] = useState(
    application.unregisteredReasonNote ?? ""
  )
  const [isConsultationEditorOpen, setIsConsultationEditorOpen] = useState(false)
  const [isConsultationHistoryOpen, setIsConsultationHistoryOpen] = useState(false)
  const [isConsultationSuccessOpen, setIsConsultationSuccessOpen] = useState(false)
  const [selectedConsultationChannel, setSelectedConsultationChannel] = useState("")
  const [selectedConsultationSentiment, setSelectedConsultationSentiment] =
    useState<ConsultationSentiment | "">("")
  const [selectedConsultationStatus, setSelectedConsultationStatus] =
    useState<ApplicationRegistrationStatus>(application.registrationStatus)
  const [selectedConsultationUnregisteredReason, setSelectedConsultationUnregisteredReason] =
    useState<ApplicationUnregisteredReason | null>(application.unregisteredReason ?? null)
  const [consultationUnregisteredReasonNote, setConsultationUnregisteredReasonNote] = useState(
    application.unregisteredReasonNote ?? ""
  )
  const [consultationNextContactAt, setConsultationNextContactAt] = useState("")
  const [consultationSubmissionId, setConsultationSubmissionId] = useState("")

  const trialResultAction = upsertTrialResultAction.bind(null, application.id)
  const [trialResultState, trialResultFormAction, isSavingTrialResult] = useActionState(
    trialResultAction,
    initialTrialResultState
  )
  const consultationAction = createConsultationLogAction.bind(null, application.id)
  const [consultationState, consultationFormAction, isSavingConsultation] = useActionState(
    consultationAction,
    initialConsultationState
  )
  const handledTrialResultSuccessTokenRef = useRef<string | null>(null)
  const handledConsultationSuccessTokenRef = useRef<string | null>(null)

  const recommendationSummary = useMemo(() => {
    return [
      application.trialResult?.recommendedCourse,
      application.trialResult?.recommendedLevel,
      application.trialResult?.recommendedSchedule
    ]
      .filter((item): item is string => Boolean(item))
      .join(" · ")
  }, [
    application.trialResult?.recommendedCourse,
    application.trialResult?.recommendedLevel,
    application.trialResult?.recommendedSchedule
  ])

  const resetTrialResultSelections = () => {
    setSelectedObservations(application.trialResult?.observations ?? [])
    setSelectedRegistrationStatus(application.registrationStatus)
    setSelectedUnregisteredReason(application.unregisteredReason ?? null)
    setUnregisteredReasonNote(application.unregisteredReasonNote ?? "")
  }

  const resetConsultationSelections = () => {
    setSelectedConsultationChannel("")
    setSelectedConsultationSentiment("")
    setSelectedConsultationStatus(application.registrationStatus)
    setSelectedConsultationUnregisteredReason(application.unregisteredReason ?? null)
    setConsultationUnregisteredReasonNote(application.unregisteredReasonNote ?? "")
    setConsultationNextContactAt("")
    setConsultationSubmissionId(crypto.randomUUID())
  }

  const openEditor = (options?: { refreshAfterClose?: boolean }) => {
    resetTrialResultSelections()
    setIsPromptOpen(false)
    setIsSuccessOpen(false)
    setRefreshOnEditorClose(Boolean(options?.refreshAfterClose))
    setIsEditorOpen(true)
  }

  const openConsultationEditor = () => {
    resetConsultationSelections()
    setIsConsultationHistoryOpen(false)
    setIsConsultationSuccessOpen(false)
    setIsConsultationEditorOpen(true)
  }

  const openConsultationHistory = () => {
    setIsConsultationHistoryOpen(true)
  }

  const closePromptLater = () => {
    setIsPromptOpen(false)
    router.refresh()
  }

  const closeEditor = () => {
    setIsEditorOpen(false)

    if (refreshOnEditorClose) {
      setRefreshOnEditorClose(false)
      router.refresh()
    }
  }

  const closeConsultationEditor = () => {
    setIsConsultationEditorOpen(false)
  }

  const closeConsultationHistory = () => {
    setIsConsultationHistoryOpen(false)
  }

  const closeSuccessModal = () => {
    setIsSuccessOpen(false)

    if (refreshOnEditorClose) {
      setRefreshOnEditorClose(false)
    }

    router.refresh()
  }

  const closeConsultationSuccessModal = () => {
    setIsConsultationSuccessOpen(false)
    router.refresh()
  }

  const toggleObservation = (value: string) => {
    setSelectedObservations((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    )
  }

  useEffect(() => {
    if (trialResultState.status !== "success" || !trialResultState.successToken) {
      return
    }

    if (handledTrialResultSuccessTokenRef.current === trialResultState.successToken) {
      return
    }

    handledTrialResultSuccessTokenRef.current = trialResultState.successToken
    setIsEditorOpen(false)
    setIsPromptOpen(false)
    setIsSuccessOpen(true)
  }, [trialResultState.status, trialResultState.successToken])

  useEffect(() => {
    if (consultationState.status !== "success" || !consultationState.successToken) {
      return
    }

    if (handledConsultationSuccessTokenRef.current === consultationState.successToken) {
      return
    }

    handledConsultationSuccessTokenRef.current = consultationState.successToken
    setIsConsultationEditorOpen(false)
    setIsConsultationSuccessOpen(true)
  }, [consultationState.status, consultationState.successToken])

  const hasTrialResult = Boolean(application.trialResult)
  const isCompletedView = application.status === "completed"
  const canAddConsultation =
    application.status === "completed" &&
    application.registrationStatus !== "enrolled" &&
    application.registrationStatus !== "not_enrolled"
  const unregisteredReasonLabel = getTrialResultUnregisteredReasonLabel(application.unregisteredReason)
  const now = useMemo(() => new Date(nowIso), [nowIso])
  const nextActionState = getNextActionState(application, now)
  const confirmedScheduleAt = application.confirmedSlotAt ?? application.requestedSlotAt
  const confirmedScheduleTime = new Date(confirmedScheduleAt).getTime()
  // 이 gate 는 "끝났는가" 가 아니라 "시작했는가" 다. 수업 중에 일찍 완료 처리하는 길을
  // 막지 않으려고 시작 시각 기준을 유지한다. 시각만 서버가 정한 now 로 통일한다.
  const shouldShowStatusActions =
    application.status !== "confirmed" ||
    Number.isNaN(confirmedScheduleTime) ||
    confirmedScheduleTime <= now.getTime()
  const consultationOnlyLogs = useMemo(
    () => application.consultationLogs.filter((item) => item.activityType === "CONSULTATION"),
    [application.consultationLogs]
  )
  const latestConsultationLog = consultationOnlyLogs[0] ?? null
  const completedTodoCard = getCompletedTodoCardCopy(application, consultationOnlyLogs.length > 0)
  const isCompletedTodoWarning = Boolean(
    application.registrationStatus !== "enrolled" &&
      application.registrationStatus !== "not_enrolled" &&
      ((!application.nextContactAt && hasTrialResult) ||
        (application.nextContactAt && new Date(application.nextContactAt).getTime() <= Date.now()))
  )
  // KPI 카드 3개를 없애고 한 줄 메타데이터로 대체한다.
  const completedDaysSinceLabel = getCompletedDaysSinceLabel(application.completedAt)
  const activityMetaLine = useMemo(() => {
    if (consultationOnlyLogs.length === 0) {
      return null
    }

    const parts = [`상담 ${consultationOnlyLogs.length}회`]
    const lastChannelLabel = getConsultationChannelLabel(latestConsultationLog?.channel)
    if (lastChannelLabel) {
      parts.push(`마지막 상담 ${lastChannelLabel}`)
    }

    const sentimentLabel = getConsultationSentimentLabel(latestConsultationLog?.sentiment)
    if (sentimentLabel) {
      parts.push(`반응 ${sentimentLabel}`)
    }

    if (completedDaysSinceLabel) {
      parts.push(`체험 후 ${completedDaysSinceLabel}`)
    }

    return parts.join("  ·  ")
  }, [consultationOnlyLogs.length, latestConsultationLog, completedDaysSinceLabel])

  const hasVisibleTrialResultContent = Boolean(
    (application.trialResult?.observations.length ?? 0) > 0 ||
      recommendationSummary ||
      application.trialResult?.note?.trim()
  )
  const phoneHref =
    typeof application.parentPhone === "string" && application.parentPhone.trim().length > 0
      ? `tel:${application.parentPhone.trim()}`
      : null

  const handleCompletedSaved = useCallback(() => {
    setIsPromptOpen(true)
  }, [])

  const activityEvents = useMemo(() => buildCaseActivityEvents(application), [application])

  // 상태가 달라도 같은 순서(다음 할 일 → 활동 기록 → 체험 결과)가 되도록 섹션을 한 번만 만든다.
  // 각 섹션은 카드 하나로 끝낸다(바깥 wrapper + 안쪽 callout 중첩을 만들지 않는다).
  const todoIsWarning = isCompletedView ? isCompletedTodoWarning : false

  // 완료 Case 의 버튼 위계: 지금 가장 중요한 것 하나만 Primary 로 둔다.
  const completedPrimaryAction = !hasTrialResult
    ? "trial_result"
    : canAddConsultation
      ? "consultation"
      : null

  const nextTodoSection = (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="다음 할 일">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>다음 할 일</h2>
      </div>

      {isCompletedView ? (
        <div
          className={`${styles.todoBlock} ${
            todoIsWarning
              ? styles.todoBlockWarning
              : application.registrationStatus === "enrolled"
                ? styles.todoBlockSuccess
                : ""
          }`}
        >
          <p className={styles.todoTitle}>{completedTodoCard.title}</p>
          {completedTodoCard.description ? (
            <p className={styles.todoDescription}>{completedTodoCard.description}</p>
          ) : null}
          {completedPrimaryAction ? (
            <div className={styles.todoActionRow}>
              {completedPrimaryAction === "trial_result" ? (
                <button type="button" className={styles.primaryButton} onClick={() => openEditor()}>
                  결과 기록
                </button>
              ) : (
                <button type="button" className={styles.primaryButton} onClick={openConsultationEditor}>
                  상담 기록
                </button>
              )}
              {phoneHref ? (
                <a href={phoneHref} className={styles.secondaryButton}>
                  전화 걸기
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : application.status === "canceled" ? (
        <p className={styles.todoTitle}>{nextActionState.title}</p>
      ) : (
        <div className={styles.todoBlock}>
          <p className={styles.todoTitle}>{nextActionState.title}</p>
          {nextActionState.description ? (
            <p className={styles.todoDescription}>{nextActionState.description}</p>
          ) : null}
          <ApplicationStatusActionForm
            applicationId={application.id}
            currentStatus={application.status}
            onCompletedSaved={handleCompletedSaved}
            variant="case-detail"
            showActions={shouldShowStatusActions}
          />
        </div>
      )}
    </section>
  )

  const activitySection = (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="활동 기록">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>활동 기록</h2>
        <div className={styles.sectionHeadActions}>
          {application.consultationLogs.length > 0 ? (
            <button type="button" className={styles.inlineTextButton} onClick={openConsultationHistory}>
              상담 {application.consultationLogs.length}건 전체 보기
            </button>
          ) : null}
          {canAddConsultation ? (
            <button type="button" className={styles.inlineTextButton} onClick={openConsultationEditor}>
              + 상담 기록
            </button>
          ) : null}
        </div>
      </div>

      {activityMetaLine ? <p className={styles.sectionMetaLine}>{activityMetaLine}</p> : null}

      {activityEvents.length === 0 ? (
        <p className={styles.simpleEmptyLine}>아직 활동 기록이 없어요.</p>
      ) : (
        <ol className={styles.activityList}>
          {activityEvents.map((event) => {
            const timeText = formatSeoulDateTime(event.at)

            // 시스템 이벤트는 한 줄. 상담 기록만 내용까지 펼친다.
            if (event.kind !== "consultation") {
              return (
                <li key={event.id} className={styles.activitySystemItem}>
                  <span className={styles.activityMarker} aria-hidden="true" />
                  <span className={styles.activitySystemTitle}>
                    {event.title}
                    {event.meta ? <span className={styles.activityMeta}> {event.meta}</span> : null}
                  </span>
                  <span className={styles.activitySystemTime}>{timeText}</span>
                </li>
              )
            }

            const detailLine = [
              ...event.details,
              event.nextContactAt
                ? `다음 연락 · ${formatSeoulDateTime(event.nextContactAt) ?? "미정"}`
                : null
            ]
              .filter((item): item is string => Boolean(item))
              .join("  ·  ")

            return (
              <li key={event.id} className={styles.activityItem}>
                <span
                  className={`${styles.activityMarker} ${styles.activityMarkerConsultation}`}
                  aria-hidden="true"
                />
                <div className={styles.activityContent}>
                  <p className={styles.activityHeadline}>
                    <span className={styles.activityTitle}>{event.title}</span>
                    <span className={styles.activityTime}>{timeText}</span>
                  </p>
                  {event.note ? <p className={styles.activityNote}>{event.note}</p> : null}
                  {detailLine ? <p className={styles.activityDetails}>{detailLine}</p> : null}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )

  const trialResultSection = (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="체험 결과">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>체험 결과</h2>
        {hasTrialResult && isCompletedView ? (
          <div className={styles.sectionHeadActions}>
            <button type="button" className={styles.inlineTextButton} onClick={() => openEditor()}>
              수정
            </button>
          </div>
        ) : null}
      </div>

      {hasTrialResult && hasVisibleTrialResultContent ? (
        <div className={styles.resultCompact}>
          {application.trialResult?.observations.length ? (
            <div className={styles.chipWrap}>
              {application.trialResult.observations.map((item) => (
                <span key={item} className={styles.summaryChip}>
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          <dl className={styles.resultGrid}>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>추천 과정</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.recommendedCourse?.trim() || "-"}
              </dd>
            </div>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>추천 레벨</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.recommendedLevel?.trim() || "-"}
              </dd>
            </div>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>추천 일정</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.recommendedSchedule?.trim() || "-"}
              </dd>
            </div>
            <div className={styles.resultGridRow}>
              <dt className={styles.resultGridLabel}>메모</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.note?.trim() || "-"}
              </dd>
            </div>
            {application.registrationStatus === "not_enrolled" ? (
              <div className={styles.resultGridRow}>
                <dt className={styles.resultGridLabel}>미등록 사유</dt>
                <dd className={styles.resultGridValue}>
                  {[
                    unregisteredReasonLabel,
                    application.unregisteredReason === "other" ? application.unregisteredReasonNote : null
                  ]
                    .filter((item): item is string => Boolean(item))
                    .join(" · ") || "-"}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : isCompletedView ? (
        <div className={styles.compactEmpty}>
          <p className={styles.simpleEmptyLine}>체험 결과가 아직 기록되지 않았어요.</p>
          <button type="button" className={styles.secondaryButton} onClick={() => openEditor()}>
            결과 기록
          </button>
        </div>
      ) : (
        <p className={styles.simpleEmptyLine}>체험 완료 처리 후 결과를 기록할 수 있어요.</p>
      )}
    </section>
  )

  return (
    <>
      {nextTodoSection}
      {activitySection}
      {trialResultSection}

      {sidebarContent ? <div className={styles.prioritySidebar}>{sidebarContent}</div> : null}

      {isCompletedView && (phoneHref || completedPrimaryAction) ? (
        <div className={styles.mobileActionBar} aria-label="모바일 빠른 액션">
          {phoneHref ? (
            <a href={phoneHref} className={styles.mobileActionButtonSecondary}>
              전화 걸기
            </a>
          ) : null}
          {completedPrimaryAction === "trial_result" ? (
            <button type="button" className={styles.mobileActionButtonPrimary} onClick={() => openEditor()}>
              결과 기록
            </button>
          ) : null}
          {completedPrimaryAction === "consultation" ? (
            <button type="button" className={styles.mobileActionButtonPrimary} onClick={openConsultationEditor}>
              상담 기록
            </button>
          ) : null}
        </div>
      ) : null}

      {isPromptOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.dialogCard} role="dialog" aria-modal="true" aria-labelledby="trial-result-prompt-title">
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="닫기"
              onClick={closePromptLater}
            >
              닫기
            </button>
            <div className={styles.dialogBody}>
              <h3 id="trial-result-prompt-title" className={styles.dialogTitle}>
                체험 결과를 기록할까요?
              </h3>
              <p className={styles.dialogDescription}>
                수업 직후 간단히 남겨두면 이후 상담에 바로 활용할 수 있습니다.
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondaryButton} onClick={closePromptLater}>
                나중에 기록
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => openEditor({ refreshAfterClose: true })}
              >
                지금 기록하기
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditorOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.dialogCardWide} role="dialog" aria-modal="true" aria-labelledby="trial-result-editor-title">
            <button type="button" className={styles.dialogClose} aria-label="닫기" onClick={closeEditor}>
              닫기
            </button>

            <div className={styles.dialogBody}>
              <h3 id="trial-result-editor-title" className={styles.dialogTitle}>
                {hasTrialResult ? "체험 결과 수정" : "체험 결과 기록"}
              </h3>
              <p className={styles.dialogDescription}>
                수업 관찰과 추천, 등록 전환 상태를 간단히 남겨두세요.
              </p>
            </div>

            <form action={trialResultFormAction} className={styles.form}>
              {trialResultState.message ? (
                <div
                  className={`${styles.message} ${
                    trialResultState.status === "error" ? styles.messageError : styles.messageSuccess
                  }`}
                >
                  {trialResultState.message}
                </div>
              ) : null}

              <section className={styles.formSection}>
                <div className={styles.formHeader}>
                  <h4 className={styles.formTitle}>수업 관찰</h4>
                  <p className={styles.formDescription}>해당하는 내용을 모두 선택해 주세요.</p>
                </div>
                <div className={styles.selectionWrap}>
                  {TRIAL_RESULT_OBSERVATION_OPTIONS.map((item) => {
                    const selected = selectedObservations.includes(item)
                    return (
                      <button
                        key={item}
                        type="button"
                        className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                        onClick={() => toggleObservation(item)}
                        disabled={isSavingTrialResult}
                      >
                        {item}
                      </button>
                    )
                  })}
                  {selectedObservations.map((item) => (
                    <input key={item} type="hidden" name="observations" value={item} />
                  ))}
                </div>
              </section>

              <div className={styles.fieldGrid}>
                <Field label="추천 과정">
                  <input
                    name="recommendedCourse"
                    defaultValue={application.trialResult?.recommendedCourse ?? ""}
                    className={styles.input}
                    disabled={isSavingTrialResult}
                  />
                </Field>
                <Field label="추천 레벨">
                  <input
                    name="recommendedLevel"
                    defaultValue={application.trialResult?.recommendedLevel ?? ""}
                    className={styles.input}
                    disabled={isSavingTrialResult}
                  />
                </Field>
              </div>

              <Field label="추천 일정">
                <input
                  name="recommendedSchedule"
                  defaultValue={application.trialResult?.recommendedSchedule ?? ""}
                  className={styles.input}
                  disabled={isSavingTrialResult}
                />
              </Field>

              <section className={styles.formSection}>
                <div className={styles.formHeader}>
                  <h4 className={styles.formTitle}>등록 전환</h4>
                  <p className={styles.formDescription}>현재 등록 결정 상태를 선택해 주세요.</p>
                </div>
                <div className={styles.selectionWrap}>
                  {TRIAL_RESULT_REGISTRATION_OPTIONS.map((item) => {
                    const selected = selectedRegistrationStatus === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                        onClick={() => setSelectedRegistrationStatus(item.value)}
                        disabled={isSavingTrialResult}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                  <input type="hidden" name="registrationStatus" value={selectedRegistrationStatus} />
                </div>
              </section>

              {selectedRegistrationStatus === "not_enrolled" ? (
                <>
                  <section className={styles.formSection}>
                    <div className={styles.formHeader}>
                      <h4 className={styles.formTitle}>미등록 사유</h4>
                      <p className={styles.formDescription}>미등록으로 결정한 이유를 선택해 주세요.</p>
                    </div>
                    <div className={styles.selectionWrap}>
                      {TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS.map((item) => {
                        const selected = selectedUnregisteredReason === item.value
                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                            onClick={() => setSelectedUnregisteredReason(item.value)}
                            disabled={isSavingTrialResult}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                      {selectedUnregisteredReason ? (
                        <input type="hidden" name="unregisteredReason" value={selectedUnregisteredReason} />
                      ) : null}
                    </div>
                  </section>

                  {selectedUnregisteredReason === "other" ? (
                    <Field label="기타 사유">
                      <input
                        name="unregisteredReasonNote"
                        value={unregisteredReasonNote}
                        onChange={(event) => setUnregisteredReasonNote(event.target.value)}
                        className={styles.input}
                        placeholder="기타 사유를 입력해 주세요."
                        disabled={isSavingTrialResult}
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              <Field label="체험 메모">
                <textarea
                  name="note"
                  defaultValue={application.trialResult?.note ?? ""}
                  rows={4}
                  className={styles.textarea}
                  placeholder="아이 반응이나 상담에 도움이 될 핵심 메모를 남겨 주세요."
                  disabled={isSavingTrialResult}
                />
              </Field>

              <div className={styles.dialogActions}>
                <button type="button" className={styles.secondaryButton} onClick={closeEditor} disabled={isSavingTrialResult}>
                  취소
                </button>
                <button type="submit" className={styles.primaryButton} disabled={isSavingTrialResult}>
                  {isSavingTrialResult ? "저장 중..." : hasTrialResult ? "수정 저장" : "결과 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isConsultationEditorOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div className={styles.dialogCardWide} role="dialog" aria-modal="true" aria-labelledby="consultation-editor-title">
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="닫기"
              onClick={closeConsultationEditor}
            >
              닫기
            </button>

            <div className={styles.dialogBody}>
              <h3 id="consultation-editor-title" className={styles.dialogTitle}>
                상담 기록 추가
              </h3>
              <p className={styles.dialogDescription}>
                상담 방식과 핵심 내용, 현재 등록 상태와 다음 연락일만 간단히 남겨두세요.
              </p>
            </div>

            <form action={consultationFormAction} className={styles.form}>
              <input type="hidden" name="submissionId" value={consultationSubmissionId} />

              {consultationState.message ? (
                <div
                  className={`${styles.message} ${
                    consultationState.status === "error" ? styles.messageError : styles.messageSuccess
                  }`}
                >
                  {consultationState.message}
                </div>
              ) : null}

              <section className={styles.formSection}>
                <div className={styles.formHeader}>
                  <h4 className={styles.formTitle}>상담 방식</h4>
                  <p className={styles.formDescription}>실제 연락한 방식을 선택해 주세요.</p>
                </div>
                <div className={styles.selectionWrap}>
                  {CONSULTATION_CHANNEL_OPTIONS.map((item) => {
                    const selected = selectedConsultationChannel === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                        onClick={() => setSelectedConsultationChannel(item.value)}
                        disabled={isSavingConsultation}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                  <input type="hidden" name="channel" value={selectedConsultationChannel} />
                </div>
              </section>

              <section className={styles.formSection}>
                <div className={styles.formHeader}>
                  <h4 className={styles.formTitle}>학부모 반응</h4>
                  <p className={styles.formDescription}>이번 상담 분위기를 선택해 주세요.</p>
                </div>
                <div className={styles.selectionWrap}>
                  {CONSULTATION_SENTIMENT_OPTIONS.map((item) => {
                    const selected = selectedConsultationSentiment === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                        onClick={() => setSelectedConsultationSentiment(item.value)}
                        disabled={isSavingConsultation}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                  <input type="hidden" name="sentiment" value={selectedConsultationSentiment} />
                </div>
                <p className={styles.fieldHelp}>
                  긍정적: 등록 의향이 느껴졌어요. 보통: 아직 판단하기 어려워요. 부정적: 등록 가능성이
                  낮아 보여요.
                </p>
              </section>

              <Field label="상담 내용">
                <textarea
                  name="note"
                  rows={4}
                  className={styles.textarea}
                  placeholder="예: 부모님과 상의 후 금요일까지 결정 예정"
                  disabled={isSavingConsultation}
                />
              </Field>

              <section className={styles.formSection}>
                <div className={styles.formHeader}>
                  <h4 className={styles.formTitle}>등록 상태</h4>
                  <p className={styles.formDescription}>현재 가장 가까운 상태를 선택해 주세요.</p>
                </div>
                <div className={styles.selectionWrap}>
                  {TRIAL_RESULT_REGISTRATION_OPTIONS.map((item) => {
                    const selected = selectedConsultationStatus === item.value
                    return (
                      <button
                        key={item.value}
                        type="button"
                        className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                        onClick={() => setSelectedConsultationStatus(item.value)}
                        disabled={isSavingConsultation}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                  <input type="hidden" name="registrationStatus" value={selectedConsultationStatus} />
                </div>
              </section>

              {selectedConsultationStatus === "not_enrolled" ? (
                <>
                  <section className={styles.formSection}>
                    <div className={styles.formHeader}>
                      <h4 className={styles.formTitle}>미등록 사유</h4>
                      <p className={styles.formDescription}>기존 미등록 사유 기준을 그대로 사용합니다.</p>
                    </div>
                    <div className={styles.selectionWrap}>
                      {TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS.map((item) => {
                        const selected = selectedConsultationUnregisteredReason === item.value
                        return (
                          <button
                            key={item.value}
                            type="button"
                            className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                            onClick={() => setSelectedConsultationUnregisteredReason(item.value)}
                            disabled={isSavingConsultation}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                      {selectedConsultationUnregisteredReason ? (
                        <input
                          type="hidden"
                          name="unregisteredReason"
                          value={selectedConsultationUnregisteredReason}
                        />
                      ) : null}
                    </div>
                  </section>

                  {selectedConsultationUnregisteredReason === "other" ? (
                    <Field label="기타 사유">
                      <input
                        name="unregisteredReasonNote"
                        value={consultationUnregisteredReasonNote}
                        onChange={(event) => setConsultationUnregisteredReasonNote(event.target.value)}
                        className={styles.input}
                        placeholder="기타 사유를 입력해 주세요."
                        disabled={isSavingConsultation}
                      />
                    </Field>
                  ) : null}
                </>
              ) : null}

              <Field label="다음 연락일">
                <input
                  type="datetime-local"
                  name="nextContactAt"
                  value={consultationNextContactAt}
                  onChange={(event) => setConsultationNextContactAt(event.target.value)}
                  className={styles.input}
                  disabled={
                    isSavingConsultation ||
                    selectedConsultationStatus === "enrolled" ||
                    selectedConsultationStatus === "not_enrolled"
                  }
                />
              </Field>

              <div className={styles.dialogActions}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={closeConsultationEditor}
                  disabled={isSavingConsultation}
                >
                  취소
                </button>
                <button type="submit" className={styles.primaryButton} disabled={isSavingConsultation}>
                  {isSavingConsultation ? "저장 중..." : "상담 기록 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ConsultationHistoryModal
        applicationId={application.id}
        logs={application.consultationLogs}
        isOpen={isConsultationHistoryOpen}
        canAddConsultation={canAddConsultation}
        onClose={closeConsultationHistory}
        onAddConsultation={openConsultationEditor}
      />

      {isSuccessOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={styles.dialogCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-result-success-title"
          >
            <div className={styles.dialogBody}>
              <h3 id="trial-result-success-title" className={styles.dialogTitle}>
                체험 결과가 저장되었습니다.
              </h3>
              <p className={styles.dialogDescription}>
                저장한 내용은 상담과 등록 전환에 활용됩니다.
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primaryButton} onClick={closeSuccessModal}>
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isConsultationSuccessOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={styles.dialogCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="consultation-success-title"
          >
            <div className={styles.dialogBody}>
              <h3 id="consultation-success-title" className={styles.dialogTitle}>
                상담 기록이 저장되었습니다.
              </h3>
              <p className={styles.dialogDescription}>
                다음 연락 일정과 최근 활동 시각도 함께 반영되었습니다.
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button type="button" className={styles.primaryButton} onClick={closeConsultationSuccessModal}>
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}


const Field = ({ label, children }: { label: string; children: ReactNode }) => {
  return (
    <label className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  )
}
