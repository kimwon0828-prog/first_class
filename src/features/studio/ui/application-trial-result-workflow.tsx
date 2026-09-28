"use client"

import { deriveApplicationDetailWorkflow, getApplicationJourney, hasTrialRecordContent, type ApplicationWorkflowEvidence } from "@/features/studio/lib/application-detail-workflow-state"
import { StudioQueryRetry } from "./studio-query-retry"

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
import {
  CONSULTATION_CHANNEL_OPTIONS,
  CONSULTATION_SENTIMENT_OPTIONS
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
  describeTrialResultObservation,
  getTrialResultObservationLabel,
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

/**
 * 저장된 관찰 값을 "현재 기준 code" 와 "문구를 저장하던 시절의 원문" 으로 가른다.
 *
 * legacy 문구를 canonical 토글에 체크해 두지 않는다. 체크해 버리면 화면이
 * "옛 기록과 새 항목이 같은 관찰" 이라고 주장하는 셈인데, 둘은 같은 사실이 아니다.
 * legacy 는 원문 그대로 따로 보여 주고, 토글은 현재 기준으로만 쓴다.
 *
 * 알 수 없는 값은 버린다 — 어느 쪽으로도 읽을 수 없어 화면에 흘리지 않는다.
 */
const splitStoredObservations = (values: string[] | undefined) => {
  const canonical: string[] = []
  const legacy: string[] = []

  for (const value of values ?? []) {
    const described = describeTrialResultObservation(value)
    if (!described) {
      continue
    }

    const bucket = described.kind === "canonical" ? canonical : legacy
    if (!bucket.includes(described.value)) {
      bucket.push(described.value)
    }
  }

  return { canonical, legacy }
}

const normalizeStoredObservations = (values: string[] | undefined): string[] =>
  splitStoredObservations(values).canonical

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
  confirmationSection?: ReactNode
  headerContent?: ReactNode
  referenceSections?: ReactNode
  reportSection?: ReactNode
  parentDecisionSection?: ReactNode
  sidebarContent?: ReactNode
  evidence: ApplicationWorkflowEvidence
  /** 서버가 정한 기준 시각. 체험 종료 판정이 hydration 전후로 갈리지 않게 한다. */
  nowIso: string
  /**
   * 쓰기 권한. 서버에서 해석해 넘긴다.
   *
   * ⚠️ 기능별로 따로 받는다. 하나의 boolean 으로 묶지 않는다 — 한 번 묶으면
   *    권한 경계가 바뀔 때(지금처럼) 어느 기능이 왜 잠겼는지 알 수 없게 된다.
   *
   * 화면에서 요금제 이름을 비교하지 않는다. 실제 차단은 server action 이 하고,
   * 여기서는 할 수 없는 버튼을 숨긴다.
   */
  canWriteTrialResults: boolean
  canWriteConsultations: boolean
  canReopenConsultation: boolean
}

export const ApplicationTrialResultWorkflow = ({
  application,
  evidence,
  headerContent,
  confirmationSection,
  sidebarContent = null,
  referenceSections = null,
  reportSection = null,
  parentDecisionSection = null,
  nowIso,
  canWriteTrialResults,
  canWriteConsultations,
  canReopenConsultation
}: ApplicationTrialResultWorkflowProps) => {
  const router = useRouter()
  const [isPromptOpen, setIsPromptOpen] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [isSuccessOpen, setIsSuccessOpen] = useState(false)
  const [refreshOnEditorClose, setRefreshOnEditorClose] = useState(false)
  const [selectedObservations, setSelectedObservations] = useState<string[]>(
    normalizeStoredObservations(application.trialResult?.observations)
  )
  // 원장이 관찰 항목을 실제로 건드렸는지. 건드리지 않은 저장은 server 가 기존 값을
  // 그대로 다시 쓴다 — 폼으로 표현할 수 없는 과거 기록이 조용히 지워지지 않게.
  const [observationsTouched, setObservationsTouched] = useState(false)
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

  // 저장된 관찰 값을 현재 기준 code 와 과거 원문으로 갈라 둔다.
  // 화면 두 곳(요약 · 편집 폼)이 같은 기준을 쓴다.
  const storedObservations = useMemo(
    () => splitStoredObservations(application.trialResult?.observations),
    [application.trialResult?.observations]
  )

  // 체험 결과 form 은 관찰 기록만 다룬다. 등록 결정(등록 상태 / 미등록 사유)은
  // 등록 상담 form 의 몫이라 여기서 초기화할 상태가 없다.
  const resetTrialResultSelections = () => {
    setSelectedObservations(normalizeStoredObservations(application.trialResult?.observations))
    setObservationsTouched(false)
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
    setObservationsTouched(true)
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
  const workflow = deriveApplicationDetailWorkflow({ application, evidence, nowIso, canWriteTrialResults, canWriteConsultations })
  const canAddConsultation = isCompletedView && !workflow.closed && !evidence.registration.error &&
    application.registrationStatus !== "enrolled" && application.registrationStatus !== "not_enrolled" && canWriteConsultations
  const canReopenRegistration = isCompletedView && application.registrationStatus === "not_enrolled" &&
    !evidence.registration.error && canReopenConsultation
  const canWriteTrialResult = canWriteTrialResults && !evidence.trialResultError
  const unregisteredReasonLabel = getTrialResultUnregisteredReasonLabel(application.unregisteredReason)
  const hasVisibleTrialResultContent = hasTrialRecordContent(application.trialResult)
  const handleCompletedSaved = useCallback(() => { setIsPromptOpen(true) }, [])
  const activityEvents = useMemo(() => buildCaseActivityEvents(application), [application])
  const consultationEvents = activityEvents.filter(event => event.kind === "consultation")
  const systemEvents = activityEvents.filter(event => event.kind !== "consultation")
  const activitySection = (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="상담 이력">
      <div className={styles.sectionHead}><h2 className={styles.sectionTitle}>상담 이력</h2>
        {canAddConsultation ? <button type="button" className={workflow.primary?.action === "consultation" ? styles.primaryButton : styles.inlineTextButton} onClick={openConsultationEditor}>상담 기록</button> : null}
      </div>
      {application.nextContactAt ? <p className={styles.sectionMetaLine}>다음 연락 · {formatSeoulDateTime(application.nextContactAt)}</p> : null}
      {consultationEvents.length ? <><p className={styles.sectionMetaLine}>{formatSeoulDateTime(consultationEvents[0].at)} · {consultationEvents[0].title}</p>
        <p className={styles.asideNote}>{consultationEvents[0].note}</p></> : <p className={styles.simpleEmptyLine}>아직 상담 기록이 없어요.</p>}
      {application.consultationLogs.length ? <button type="button" className={styles.inlineTextButton} onClick={openConsultationHistory}>상담 {application.consultationLogs.length}건 전체 보기 →</button> : null}
    </section>
  )
  const trialResultSection = !isCompletedView && !hasVisibleTrialResultContent ? null : (
    <section className={styles.recordContent} aria-label="체험 기록">
      {hasVisibleTrialResultContent ? <div className={styles.sectionHead}>
        <h4 className={styles.sectionTitle}>기록 내용</h4>
        {hasTrialResult && isCompletedView && canWriteTrialResult ? (
          <div className={styles.sectionHeadActions}>
            <button type="button" className={styles.inlineTextButton} onClick={() => openEditor()}>
              기록 수정
            </button>
          </div>
        ) : null}
      </div> : null}

      {hasVisibleTrialResultContent && !evidence.report.version ? <p className={styles.recordSummary}>
        관찰 {application.trialResult?.observations.length ?? 0}개
        {recommendationSummary ? ` · ${recommendationSummary}` : ""}
        {application.trialResult?.publicSummary?.trim() ? " · 공개 총평 작성" : ""}
      </p> : null}
      {hasVisibleTrialResultContent && !evidence.report.version && application.trialResult?.publicSummary?.trim() ? <p className={styles.recordPreview}>{application.trialResult.publicSummary}</p> : null}
      {hasTrialResult && hasVisibleTrialResultContent ? (
        <details className={styles.resultCompact}><summary className={styles.disclosureSummary}>작성한 체험 기록 보기</summary>
          {storedObservations.canonical.length ? (
            <div className={styles.chipWrap}>
              {storedObservations.canonical.map((code) => (
                <span key={code} className={styles.summaryChip}>
                  {getTrialResultObservationLabel(code)}
                </span>
              ))}
            </div>
          ) : null}

          {/*
            문구를 저장하던 시절의 기록은 원문 그대로 보여 준다.
            현재 문구로 바꿔 보여 주면 옛 기록이 지금 기준의 관찰인 것처럼 읽힌다.
          */}
          {storedObservations.legacy.length ? (
            <div className={styles.legacyObservationBlock}>
              <p className={styles.legacyObservationTitle}>기존 관찰 기록</p>
              <div className={styles.chipWrap}>
                {storedObservations.legacy.map((text) => (
                  <span key={text} className={styles.legacyObservationChip}>
                    {text}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <dl className={styles.resultGrid}>
            <div className={styles.resultGridRow}><dt className={styles.resultGridLabel}>공개 총평</dt><dd className={styles.resultGridValue}>{application.trialResult?.publicSummary?.trim() || "-"}</dd></div>
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
              <dt className={styles.resultGridLabel}>내부 메모 · 비공개</dt>
              <dd className={styles.resultGridValue}>
                {application.trialResult?.note?.trim() || "-"}
              </dd>
            </div>
          </dl>
        </details>
      ) : isCompletedView ? (
        <div className={styles.compactEmpty}>
          <p className={styles.simpleEmptyLine}>관찰 내용과 추천 사항을 기록하면 학부모 리포트로 전달할 수 있어요.</p>
          {canWriteTrialResult ? (
            <button type="button" className={workflow.closed ? styles.secondaryButton : styles.primaryButton} onClick={() => openEditor()}>
              체험 기록 작성
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )

  const preferenceParsed = parseRegularSchedulePreference(application.regularSchedulePreference)

  const registrationConsultationSection = isCompletedView ? (
    <section className={`${styles.card} ${styles.sectionCard}`} aria-label="학원 등록 결과">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>학원 등록 결과</h2>
        {canAddConsultation || canReopenRegistration ? (
          <div className={styles.sectionHeadActions}>
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

      {evidence.registration.error ? <div role="alert"><p>등록 결과 정보를 불러오지 못했어요.</p><StudioQueryRetry /></div> : <>
      <p className={styles.sectionMetaLine}>{workflow.result ? "학원에서 확인한 실제 등록 결과입니다." : "아직 등록 결과가 입력되지 않았습니다."}</p>
      {canAddConsultation ? <button type="button" className={workflow.primary?.action === "registration" ? styles.primaryButton : styles.secondaryButton} onClick={openConsultationEditor}>등록 결과 입력</button> : null}
      <dl className={styles.resultGrid}>
        <div className={styles.resultGridRow}>
          <dt className={styles.resultGridLabel}>등록 상태</dt>
          <dd className={styles.resultGridValue}>
            <StudioStatusBadge tone={getStudioRegistrationStatusTone(workflow.result ?? application.registrationStatus)}>
              {workflow.result ? getStudioRegistrationStatusLabel(workflow.result) : "미입력"}
            </StudioStatusBadge>
          </dd>
        </div>

        {preferenceParsed.status !== "empty" ? <div className={styles.resultGridRow}>
          <dt className={styles.resultGridLabel}>정규수업 희망 일정</dt>
          <dd className={styles.resultGridValue}>
            {preferenceParsed.status === "valid"
              ? formatRegularSchedulePreference(preferenceParsed.value)
              : "표시할 수 없는 기록"}
            {preferenceParsed.status === "valid" && application.regularSchedulePreferenceNote ? (
              <span className={styles.resultGridHint}>
                {application.regularSchedulePreferenceNote}
              </span>
            ) : null}
          </dd>
        </div> : null}

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
      {evidence.registration.resolvedAt ? <p className={styles.sectionMetaLine}>{formatSeoulDateTime(evidence.registration.resolvedAt)} 확정</p> : null}
      </>}
    </section>
  ) : null


  const systemSection = <details className={styles.systemDisclosure} aria-label="시스템 이력">
    <summary className={styles.disclosureSummary}>시스템 이력 보기</summary>
    {systemEvents.length ? <ol className={styles.activityList}>{systemEvents.map(event => <li key={event.id} className={styles.activitySystemItem}><span className={styles.activitySystemTitle}>{event.title}{event.meta ? ` · ${event.meta}` : ""}</span><span className={styles.activitySystemTime}>{formatSeoulDateTime(event.at)}</span></li>)}</ol> : <p className={styles.simpleEmptyLine}>시스템 이력이 없습니다.</p>}
  </details>
  const progressSteps = application.status === "completed" ? workflow.steps : getApplicationJourney(application, new Date(nowIso))
  const stepStateLabels = { done: "완료", current: "진행 중", waiting: "대기", available: "작업 가능", restricted: "제한", error: "조회 실패" }

  return (
    <>
      <div className={`${styles.workspace} ${confirmationSection ? styles.withConfirmation : ""}`}>
        <section className={styles.workspaceHeader} aria-label="신청 작업 헤더">
          {headerContent}
          {!confirmationSection && workflow.primary?.action === "status" ? (
            <div className={styles.statusActions}>
              <ApplicationStatusActionForm applicationId={application.id} currentStatus={application.status}
                variant="case-detail" primaryTone={workflow.primary?.action === "status" ? "primary" : "secondary"} onCompletedSaved={handleCompletedSaved} />
            </div>
          ) : null}
        </section>

        <section className={styles.progressCard} aria-labelledby="workflow-progress-title">
          <h2 id="workflow-progress-title" className={styles.sectionTitle}>진행 현황</h2>
          <p className={styles.sectionMetaLine}>체험부터 등록 결과까지의 진행 상황을 한눈에 확인할 수 있습니다.</p>
          <ol className={`${styles.stepper} ${application.status !== "completed" ? styles.journeyStepper : ""}`} aria-label="신청 진행 단계">
            {progressSteps.map((step, index) => <li key={step.id} data-state={step.state} aria-current={step.state === "current" ? "step" : undefined}>
              <span className={styles.stepNumber}>{step.state === "done" ? "✓" : index + 1}</span>
              <strong>{step.title}</strong>
              <span className={styles.stepSummary}>{step.id === "parent" && evidence.parentDecision.value && !evidence.parentDecision.error ? formatSeoulDateTime(evidence.parentDecision.createdAt) ?? "응답 완료" : step.summary}</span>
              <span className={styles.stepState}>{application.status !== "completed" && step.state === "current" && step.summary !== "체험 진행 중" ? "다음 단계" : stepStateLabels[step.state]}</span>
            </li>)}
          </ol>
        </section>

        {confirmationSection ? <section id="confirm-schedule" className={`${styles.card} ${styles.confirmationCard}`} aria-label="일정 확정">
          <h2 className={styles.sectionTitle}>일정 확정</h2>
          <p className={styles.sectionMetaLine}>체험 일정을 확정해 주세요.</p>
          {confirmationSection}
        </section> : null}
        <section className={`${styles.card} ${styles.recordCard}`} aria-labelledby="record-report-title">
          <h2 id="record-report-title" className={styles.sectionTitle}>체험 기록 · 리포트</h2>
          <p className={styles.sectionMetaLine}>수업 후 작성한 체험 기록과 리포트입니다.</p>
          {evidence.trialResultError ? <div role="alert"><p>체험 기록 정보를 불러오지 못했어요.</p><StudioQueryRetry /></div>
            : trialResultSection ?? <p className={styles.simpleEmptyLine}>{application.status === "canceled" ? "남아 있는 체험 기록이 없습니다." : "체험을 완료한 뒤 기록할 수 있어요."}</p>}
          {/* 기록 조회 실패와 발행본 조회는 독립적이다. 확인된 발행본은 계속 보여 준다. */}
          {hasVisibleTrialResultContent || evidence.report.version || evidence.report.error ? reportSection : null}
        </section>

        <aside className={styles.workspaceAside} aria-label="신청 참고 패널">
          {sidebarContent}
          {activitySection}
          {isCompletedView ? <>
            {parentDecisionSection}
            {!application.parentId ? <p className={styles.sectionMetaLine}>학부모 계정이 연결되어 있지 않아요. 학원 등록 결과는 계속 기록할 수 있어요.</p> : null}
            {registrationConsultationSection}
          </> : null}
        </aside>

        <div className={styles.supplementary}>
          <section className={`${styles.card} ${styles.sectionCard}`} aria-label="최근 활동">
            <h2 className={styles.sectionTitle}>최근 활동</h2>
            {activityEvents.length ? <ol className={styles.activityList}>{activityEvents.slice(0, 3).map(event => <li key={event.id} className={styles.activityItem}><span className={styles.activityMarker} aria-hidden="true" /><div className={styles.activityContent}><p className={styles.activityTitle}>{event.title}</p><p className={styles.activityTime}>{formatSeoulDateTime(event.at)}</p></div></li>)}</ol> : <p className={styles.simpleEmptyLine}>아직 활동 내역이 없습니다.</p>}
          </section>
          {referenceSections}
        </div>
        {systemSection}
      </div>

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
                체험 기록을 작성할까요?
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
                {hasTrialResult ? "체험 기록 수정" : "체험 기록 작성"}
              </h3>
              <p className={styles.dialogDescription}>
                관찰·추천·공개 총평은 학부모 리포트에 포함됩니다. 내부 메모는 공개되지 않아요.
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

                {/*
                  문구를 저장하던 시절의 기록은 아래 선택 항목으로 옮겨 적을 수 없다.
                  의미가 같지 않아 대신 체크해 주지 않는다. 원문만 보여 주고,
                  다시 평가한다면 현재 기준으로 직접 고르게 한다.
                */}
                {storedObservations.legacy.length ? (
                  <div className={styles.legacyObservationBlock}>
                    <p className={styles.legacyObservationTitle}>기존 관찰 기록</p>
                    <ul className={styles.legacyObservationList}>
                      {storedObservations.legacy.map((text) => (
                        <li key={text}>{text}</li>
                      ))}
                    </ul>
                    <p className={styles.legacyObservationHint}>
                      이전 기준으로 적힌 기록이라 아래 항목에 자동으로 반영하지 않았어요. 아래에서
                      항목을 선택해 저장하면 기존 기록은 선택한 내용으로 대체됩니다. 선택하지 않고
                      저장하면 기존 기록이 그대로 유지돼요.
                    </p>
                  </div>
                ) : null}

                <div className={styles.selectionWrap}>
                  {TRIAL_RESULT_OBSERVATION_OPTIONS.map((option) => {
                    const selected = selectedObservations.includes(option.value)
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                        aria-pressed={selected}
                        onClick={() => toggleObservation(option.value)}
                        disabled={isSavingTrialResult}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                  {selectedObservations.map((item) => (
                    <input key={item} type="hidden" name="observations" value={item} />
                  ))}
                  {/*
                    선택을 건드리지 않은 저장은 server 가 기존 값을 그대로 다시 쓴다.
                    추천 과정만 고치는 저장에서 과거 기록이 사라지지 않게 한다.
                  */}
                  <input
                    type="hidden"
                    name="observationsTouched"
                    value={observationsTouched ? "true" : "false"}
                  />
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

              {/*
                총평과 메모는 다른 칸이다.

                총평은 부모가 읽는다. 메모는 학원만 본다. 한 칸으로 합치면
                부모에게 보일 것을 전제로 쓰지 않은 말이 그대로 나가게 된다 —
                그래서 두 칸을 나란히 두고, 각각 누가 읽는지 적어 둔다.
              */}
              <Field label="총평">
                <textarea
                  name="publicSummary"
                  defaultValue={application.trialResult?.publicSummary ?? ""}
                  rows={4}
                  className={styles.textarea}
                  placeholder="학부모님께 전할 한 문단을 적어 주세요. 리포트에 그대로 실립니다."
                  maxLength={1000}
                  disabled={isSavingTrialResult}
                />
                <p className={styles.fieldHint}>학부모가 리포트에서 읽습니다.</p>
              </Field>

              <Field label="내부 메모 · 비공개">
                <textarea
                  name="note"
                  defaultValue={application.trialResult?.note ?? ""}
                  rows={4}
                  className={styles.textarea}
                  placeholder="아이 반응이나 상담에 도움이 될 핵심 메모를 남겨 주세요."
                  disabled={isSavingTrialResult}
                />
                <p className={styles.fieldHint}>학원 내부에만 보입니다.</p>
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
                체험 기록이 저장되었습니다.
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
          title="체험 기록을 저장하지 못했습니다"
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
