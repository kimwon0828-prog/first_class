"use client"

import type { ReactNode } from "react"
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  reopenRegistrationConsultationAction,
  type ReopenRegistrationConsultationActionState
} from "@/features/studio/actions/reopen-registration-consultation"
import {
  createConsultationLogAction,
  type CreateConsultationLogActionState
} from "@/features/studio/actions/create-consultation-log"
import {
  getStudioRegistrationStatusLabel,
  getStudioRegistrationStatusTone
} from "@/features/studio/lib/application-status-labels"
import { buildCaseActivityEvents } from "@/features/studio/lib/case-activity"
import {
  formatRegularSchedulePreference,
  parseRegularSchedulePreference
} from "@/features/studio/lib/regular-schedule-preference"
import { getTrialProgressState } from "@/features/studio/lib/trial-completion"
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
import { StudioStatusBadge } from "@/features/studio/ui/studio-status-badge"
import { ConsultationHistoryModal } from "@/features/studio/ui/consultation-history-modal"
import { RegularSchedulePreferenceEditor } from "@/features/studio/ui/regular-schedule-preference-editor"
import { SaveErrorDialog } from "@/features/studio/ui/save-error-dialog"
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

const initialReopenState: ReopenRegistrationConsultationActionState = {
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
  /**
   * 신청 정보 / 담당 선생님처럼 "이미 아는 참조 정보" 섹션.
   *
   * 다음 할 일 바로 아래에 놓기 위해 서버에서 만들어 넘긴다.
   * 원장이 상세로 들어오는 이유는 "지금 무엇을 할지" 하나라서
   * 참조 정보가 그보다 먼저 오면 안 된다(디자인 시스템 §4.2).
   */
  referenceSections?: ReactNode
  sidebarContent?: ReactNode
  /** 서버가 정한 기준 시각. 체험 종료 판정이 hydration 전후로 갈리지 않게 한다. */
  nowIso: string
  /**
   * 유료 쓰기 권한. 서버에서 해석해 넘긴다.
   *
   * 화면에서 요금제 이름을 비교하지 않는다. 잠긴 경우에도 기존 체험 결과와
   * 상담 이력은 그대로 보여 준다 — 잠기는 것은 새로 쓰기뿐이다.
   * 실제 차단은 server action 이 하고, 여기서는 할 수 없는 버튼을 숨긴다.
   */
  paidWriteAccess: {
    canWriteTrialResults: boolean
    canWriteConsultations: boolean
    canReopenConsultation: boolean
  }
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
      title: "미등록으로 종료했어요.",
      description: "학부모가 다시 문의하면 등록 상담에서 상담을 재개할 수 있습니다.",
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
    // 진행 상태는 trial-completion 하나만 판단한다. 여기서 다시 계산하지 않는다.
    // 배지는 어느 경우든 "체험 중" 이다. 여기서는 다음 행동 문구만 고른다.
    const progress = getTrialProgressState(
      {
        confirmedBlockStartAt: application.confirmedBlockStartAt,
        confirmedBlockEndAt: application.confirmedBlockEndAt,
        confirmedSlotAt: application.confirmedSlotAt,
        scheduleStartTime: application.scheduleStartTime,
        scheduleEndTime: application.scheduleEndTime
      },
      now
    )

    return {
      title:
        progress === "after_scheduled_end"
          ? "체험이 끝났다면 완료 처리해 주세요."
          : progress === "in_trial"
            ? "체험이 진행 중입니다."
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
      // 상담 재개가 가능하므로 "추가 상담을 하지 말라" 는 의미를 남기지 않는다.
      title: "미등록으로 종료했어요.",
      description: "학부모가 다시 문의하면 등록 상담에서 상담을 재개할 수 있습니다."
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
  referenceSections = null,
  nowIso,
  paidWriteAccess
}: ApplicationTrialResultWorkflowProps) => {
  const router = useRouter()
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [refreshOnEditorClose, setRefreshOnEditorClose] = useState(false)
  const [selectedObservations, setSelectedObservations] = useState<string[]>(
    application.trialResult?.observations ?? []
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
  // 실패 문구는 form 안 inline 으로만 두면 스크롤 아래에서 안 보인다. dialog 로 올린다.
  const [trialResultErrorMessage, setTrialResultErrorMessage] = useState<string | null>(null)
  const trialResultSubmitButtonRef = useRef<HTMLButtonElement | null>(null)
  const [consultationErrorMessage, setConsultationErrorMessage] = useState<string | null>(null)
  const consultationSubmitButtonRef = useRef<HTMLButtonElement | null>(null)
  const [isReopenOpen, setIsReopenOpen] = useState(false)
  const reopenAction = reopenRegistrationConsultationAction.bind(null, application.id)
  const [reopenState, submitReopen, isReopening] = useActionState(
    reopenAction,
    initialReopenState
  )
  const consultationAction = createConsultationLogAction.bind(null, application.id)
  const [consultationState, consultationFormAction, isSavingConsultation] = useActionState(
    consultationAction,
    initialConsultationState
  )
  const handledTrialResultSuccessTokenRef = useRef<string | null>(null)
  const handledConsultationSuccessTokenRef = useRef<string | null>(null)
  const handledReopenSuccessTokenRef = useRef<string | null>(null)

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

  // 체험 결과 form 은 관찰 기록만 다룬다. 등록 결정(등록 상태 / 미등록 사유)은
  // 등록 상담 form 의 몫이라 여기서 초기화할 상태가 없다.
  const resetTrialResultSelections = () => {
    setSelectedObservations(application.trialResult?.observations ?? [])
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
    setTrialResultErrorMessage(null)
    setIsPromptOpen(false)
    setIsSuccessOpen(false)
    setRefreshOnEditorClose(Boolean(options?.refreshAfterClose))
    setIsEditorOpen(true)
  }

  const openConsultationEditor = () => {
    resetConsultationSelections()
    setConsultationErrorMessage(null)
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

  // trialResultState / consultationState 는 제출마다 새 객체다.
  // 같은 문구로 다시 실패해도 dialog 가 다시 뜬다.
  useEffect(() => {
    if (trialResultState.status === "error") {
      setTrialResultErrorMessage(trialResultState.message)
      return
    }

    if (trialResultState.status === "success") {
      setTrialResultErrorMessage(null)
    }
  }, [trialResultState])

  useEffect(() => {
    if (consultationState.status === "error") {
      setConsultationErrorMessage(consultationState.message)
      return
    }

    if (consultationState.status === "success") {
      setConsultationErrorMessage(null)
    }
  }, [consultationState])

  useEffect(() => {
    if (reopenState.status !== "success" || !reopenState.successToken) {
      return
    }

    if (handledReopenSuccessTokenRef.current === reopenState.successToken) {
      return
    }

    handledReopenSuccessTokenRef.current = reopenState.successToken
    setIsReopenOpen(false)
    router.refresh()
  }, [reopenState.status, reopenState.successToken, router])

  const hasTrialResult = Boolean(application.trialResult)
  const isCompletedView = application.status === "completed"
  // 상담을 새로 쓸 수 있는 Case 인가(업무 조건) + 쓸 수 있는 플랜인가(권한).
  const isConsultationWritableCase =
    application.status === "completed" &&
    application.registrationStatus !== "enrolled" &&
    application.registrationStatus !== "not_enrolled"
  const canAddConsultation =
    isConsultationWritableCase && paidWriteAccess.canWriteConsultations
  // 재개는 미등록 종결에만 연다. 등록 완료(enrolled)는 취소/환불이라는 다른 의미라 대상이 아니다.
  const canReopenRegistration =
    application.status === "completed" &&
    application.registrationStatus === "not_enrolled" &&
    paidWriteAccess.canReopenConsultation
  const canWriteTrialResult = paidWriteAccess.canWriteTrialResults
  // 잠긴 안내는 한 화면에 하나만 둔다(디자인 시스템 §10.2).
  // 체험 완료 이후 원장이 실제로 막히는 지점이 "다음 할 일" 이라 거기에 놓는다.
  const isPaidWorkflowLocked =
    isCompletedView && !paidWriteAccess.canWriteTrialResults && !paidWriteAccess.canWriteConsultations
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
    ? canWriteTrialResult
      ? "trial_result"
      : null
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
          {isPaidWorkflowLocked ? (
            <p className={styles.todoDescription}>
              체험 결과와 등록 상담 기록은 스탠다드 플랜에서 남길 수 있습니다. 이미 저장된 기록은
              아래에서 그대로 확인할 수 있습니다.
            </p>
          ) : null}
          {completedPrimaryAction || (isPaidWorkflowLocked && phoneHref) ? (
            <div className={styles.todoActionRow}>
              {completedPrimaryAction === "trial_result" ? (
                <button type="button" className={styles.primaryButton} onClick={() => openEditor()}>
                  결과 기록
                </button>
              ) : completedPrimaryAction === "consultation" ? (
                <button type="button" className={styles.primaryButton} onClick={openConsultationEditor}>
                  상담 기록
                </button>
              ) : null}
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

  // 등록 상담과 같은 기준이다. 실제 status 가 completed 일 때만 연다.
  // 아직 할 수 없는 일을 위한 빈 카드를 미리 만들지 않는다(디자인 시스템 §4.2).
  const trialResultSection = !isCompletedView ? null : (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="체험 결과">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>체험 결과</h2>
        {hasTrialResult && isCompletedView && canWriteTrialResult ? (
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
              <dt className={styles.resultGridLabel}>학원 추천 일정</dt>
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
          </dl>
        </div>
      ) : isCompletedView ? (
        <div className={styles.compactEmpty}>
          <p className={styles.simpleEmptyLine}>체험 결과가 아직 기록되지 않았어요.</p>
          {canWriteTrialResult ? (
            <button type="button" className={styles.secondaryButton} onClick={() => openEditor()}>
              결과 기록
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )

  // 체험 결과(관찰)와 등록 상담(결정)을 카드로 분리한다.
  // 실제 DB status 가 completed 일 때만 노출한다 — `체험 중` 에는 열지 않는다.
  const preferenceParsed = parseRegularSchedulePreference(application.regularSchedulePreference)

  const registrationConsultationSection = isCompletedView ? (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="등록 상담">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>등록 상담</h2>
        {canAddConsultation || canReopenRegistration ? (
          <div className={styles.sectionHeadActions}>
            {canAddConsultation ? (
              <button type="button" className={styles.inlineTextButton} onClick={openConsultationEditor}>
                + 상담 기록
              </button>
            ) : null}
            {canReopenRegistration ? (
              <button
                type="button"
                className={styles.inlineTextButton}
                onClick={() => setIsReopenOpen(true)}
              >
                상담 재개
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <dl className={styles.resultGrid}>
        <div className={styles.resultGridRow}>
          <dt className={styles.resultGridLabel}>등록 상태</dt>
          <dd className={styles.resultGridValue}>
            <StudioStatusBadge tone={getStudioRegistrationStatusTone(application.registrationStatus)}>
              {getStudioRegistrationStatusLabel(application.registrationStatus)}
            </StudioStatusBadge>
          </dd>
        </div>

        <div className={styles.resultGridRow}>
          <dt className={styles.resultGridLabel}>정규수업 희망 일정</dt>
          <dd className={styles.resultGridValue}>
            {preferenceParsed.status === "valid"
              ? formatRegularSchedulePreference(preferenceParsed.value)
              : preferenceParsed.status === "empty"
                ? "아직 기록하지 않았어요."
                : "표시할 수 없는 기록"}
            {preferenceParsed.status === "valid" && application.regularSchedulePreferenceNote ? (
              <span className={styles.resultGridHint}>
                {application.regularSchedulePreferenceNote}
              </span>
            ) : null}
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

        {application.nextContactAt ? (
          <div className={styles.resultGridRow}>
            <dt className={styles.resultGridLabel}>다음 연락</dt>
            <dd className={styles.resultGridValue}>
              {formatSeoulDateTime(application.nextContactAt) ?? "-"}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  ) : null

  return (
    <>
      {nextTodoSection}
      {referenceSections}
      {activitySection}
      {trialResultSection}
      {registrationConsultationSection}

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
                수업에서 관찰한 내용과 추천 사항을 간단히 남겨두세요.
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
                        aria-pressed={selected}
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
                <button
                  ref={trialResultSubmitButtonRef}
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isSavingTrialResult}
                >
                  {isSavingTrialResult ? "저장 중..." : hasTrialResult ? "수정 저장" : "결과 저장"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isConsultationEditorOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={`${styles.dialogCardWide} ${styles.dialogCardStickyActions}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="consultation-editor-title"
          >
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
                        aria-pressed={selected}
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
                        aria-pressed={selected}
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
                        aria-pressed={selected}
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
                            aria-pressed={selected}
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

              <RegularSchedulePreferenceEditor
                currentPreference={application.regularSchedulePreference}
                currentNote={application.regularSchedulePreferenceNote}
                disabled={isSavingConsultation}
                showScheduleMismatchGuidance={
                  selectedConsultationStatus === "not_enrolled" &&
                  selectedConsultationUnregisteredReason === "schedule_mismatch"
                }
              />

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

              <div className={`${styles.dialogActions} ${styles.dialogActionsSticky}`}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={closeConsultationEditor}
                  disabled={isSavingConsultation}
                >
                  취소
                </button>
                <button
                  ref={consultationSubmitButtonRef}
                  type="submit"
                  className={styles.primaryButton}
                  disabled={isSavingConsultation}
                >
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

      {trialResultErrorMessage !== null ? (
        <SaveErrorDialog
          title="체험 결과를 저장하지 못했습니다"
          message={trialResultErrorMessage}
          onConfirm={() => {
            setTrialResultErrorMessage(null)
            trialResultSubmitButtonRef.current?.focus()
          }}
        />
      ) : null}

      {consultationErrorMessage !== null ? (
        <SaveErrorDialog
          title="상담 기록을 저장하지 못했습니다"
          message={consultationErrorMessage}
          onConfirm={() => {
            setConsultationErrorMessage(null)
            // 작성 중이던 form 의 저장 버튼으로 focus 를 돌려준다.
            consultationSubmitButtonRef.current?.focus()
          }}
        />
      ) : null}

      {isReopenOpen ? (
        <div className={styles.dialogOverlay} role="presentation">
          <div
            className={styles.dialogCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="reopen-registration-title"
          >
            <div className={styles.dialogBody}>
              <h3 id="reopen-registration-title" className={styles.dialogTitle}>
                상담을 다시 진행할까요?
              </h3>
              <p className={styles.dialogDescription}>
                현재 미등록 상태를 결정 대기로 변경하고 추가 상담을 기록할 수 있게 됩니다. 과거 상담
                기록과 미등록 이력은 유지됩니다.
              </p>
              {reopenState.status === "error" && reopenState.message ? (
                <div className={`${styles.message} ${styles.messageError}`}>{reopenState.message}</div>
              ) : null}
            </div>
            <form action={submitReopen} className={styles.dialogActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setIsReopenOpen(false)}
                disabled={isReopening}
              >
                취소
              </button>
              <button type="submit" className={styles.primaryButton} disabled={isReopening}>
                {isReopening ? "처리 중..." : "상담 재개"}
              </button>
            </form>
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
                {consultationState.successMode === "duplicate"
                  ? "이미 저장된 상담 기록입니다."
                  : "상담 기록이 저장되었습니다."}
              </h3>
              <p className={styles.dialogDescription}>
                {consultationState.successMode === "duplicate"
                  ? "같은 제출이 이미 저장돼 있어 이번에 입력한 내용은 반영되지 않았습니다. 내용을 바꾸려면 상담 이력에서 수정해 주세요."
                  : "다음 연락 일정과 최근 활동 시각도 함께 반영되었습니다."}
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
