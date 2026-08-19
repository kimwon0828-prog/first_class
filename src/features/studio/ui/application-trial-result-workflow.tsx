"use client"

import type { ReactNode } from "react"
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  createConsultationLogAction,
  type CreateConsultationLogActionState
} from "@/features/studio/actions/create-consultation-log"
import {
  CONSULTATION_CHANNEL_OPTIONS,
  CONSULTATION_SENTIMENT_OPTIONS,
  getConsultationChannelLabel
} from "@/features/studio/lib/consultation-log-options"
import {
  formatSeoulDateTime
} from "@/features/studio/lib/seoul-datetime"
import {
  upsertTrialResultAction,
  type UpsertTrialResultActionState
} from "@/features/studio/actions/upsert-trial-result"
import {
  getTrialResultRegistrationLabel,
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
  StudioApplicationDetail,
  StudioConsultationLog
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

const getNextActionState = (application: StudioApplicationDetail): NextActionState => {
  if (application.status === "new" || application.status === "reviewing") {
    return {
      title: "담당 선생님과 일정을 확인한 뒤 수업 확정으로 넘겨 주세요.",
      description: null,
      tone: "default"
    }
  }

  if (application.status === "confirmed") {
    return {
      title: "체험 진행이 끝나면 체험 완료 처리하거나, 노쇼 여부를 정리해 주세요.",
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

const getConsultationMeta = (item: StudioConsultationLog) => {
  if (item.activityType === "LEGACY_IMPORT") {
    return "이전 기록"
  }

  const occurredAt = formatSeoulDateTime(item.occurredAt)
  const channelLabel = getConsultationChannelLabel(item.channel)

  return [occurredAt, channelLabel].filter((value): value is string => Boolean(value)).join(" · ")
}

export const ApplicationTrialResultWorkflow = ({
  application,
  sidebarContent = null
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
  const shouldShowTrialResultSection = application.status === "completed" || hasTrialResult
  const shouldShowConsultationSection =
    application.status === "completed" || application.consultationLogs.length > 0
  const canAddConsultation =
    application.status === "completed" &&
    application.registrationStatus !== "enrolled" &&
    application.registrationStatus !== "not_enrolled"
  const registrationLabel = getTrialResultRegistrationLabel(application.registrationStatus)
  const unregisteredReasonLabel = getTrialResultUnregisteredReasonLabel(application.unregisteredReason)
  const nextActionState = getNextActionState(application)
  const latestConsultationLog =
    application.consultationLogs.find((item) => item.activityType === "CONSULTATION") ??
    application.consultationLogs[0] ??
    null

  const handleCompletedSaved = useCallback(() => {
    setIsPromptOpen(true)
  }, [])

  return (
    <>
      <section className={styles.card} aria-label="다음에 할 일">
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>다음에 할 일</h2>
            <p className={styles.sectionDescription}>
              현재 파이프라인 상태를 기준으로 다음 액션을 안내합니다.
            </p>
          </div>
        </div>

        <div className={styles.todoBody}>
          {application.status === "canceled" ? (
            <div className={styles.todoNotice}>{nextActionState.title}</div>
          ) : application.status === "completed" ? (
            <div
              className={`${styles.todoStatusCard} ${
                nextActionState.tone === "warning"
                  ? styles.todoStatusCardWarning
                  : nextActionState.tone === "success"
                    ? styles.todoStatusCardSuccess
                    : ""
              }`}
            >
              <p className={styles.todoStatusTitle}>{nextActionState.title}</p>
              {nextActionState.description ? (
                <p className={styles.todoStatusDescription}>{nextActionState.description}</p>
              ) : null}
              {nextActionState.actionType === "trial_result" ? (
                <button type="button" className={styles.primaryButton} onClick={() => openEditor()}>
                  {nextActionState.actionLabel}
                </button>
              ) : null}
              {nextActionState.actionType === "consultation" && canAddConsultation ? (
                <button type="button" className={styles.primaryButton} onClick={openConsultationEditor}>
                  {nextActionState.actionLabel}
                </button>
              ) : null}
            </div>
          ) : (
            <ApplicationStatusActionForm
              applicationId={application.id}
              currentStatus={application.status}
              onCompletedSaved={handleCompletedSaved}
            />
          )}
        </div>
      </section>

      {shouldShowTrialResultSection || shouldShowConsultationSection || sidebarContent ? (
        <div className={styles.priorityGrid}>
          <div className={styles.priorityContent}>
            {shouldShowTrialResultSection ? (
              <section className={styles.card} aria-label="체험 결과">
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 className={styles.sectionTitle}>체험 결과</h2>
                    <p className={styles.sectionDescription}>
                      수업 직후 관찰 내용과 추천, 등록 전환 상태를 간단히 기록해 이후 상담에 활용하세요.
                    </p>
                  </div>
                  <button type="button" className={styles.ghostButton} onClick={() => openEditor()}>
                    {hasTrialResult ? "보기/수정" : "결과 기록"}
                  </button>
                </div>

                {hasTrialResult ? (
                  <div className={styles.resultStack}>
                    <ResultRow label="수업 관찰">
                      <div className={styles.chipWrap}>
                        {application.trialResult?.observations.length ? (
                          application.trialResult.observations.map((item) => (
                            <span key={item} className={styles.summaryChip}>
                              {item}
                            </span>
                          ))
                        ) : (
                          <span className={styles.emptyInline}>기록 없음</span>
                        )}
                      </div>
                    </ResultRow>

                    <ResultRow label="추천">
                      <p className={styles.resultValue}>{recommendationSummary || "기록 없음"}</p>
                    </ResultRow>

                    <ResultRow label="등록 전환">
                      <p className={styles.resultValue}>{registrationLabel ?? "기록 없음"}</p>
                    </ResultRow>

                    {application.registrationStatus === "not_enrolled" ? (
                      <ResultRow label="미등록 사유">
                        <p className={styles.resultMemo}>
                          {[
                            unregisteredReasonLabel,
                            application.unregisteredReason === "other"
                              ? application.unregisteredReasonNote
                              : null
                          ]
                            .filter((item): item is string => Boolean(item))
                            .join(" · ") || "기록 없음"}
                        </p>
                      </ResultRow>
                    ) : null}

                    <ResultRow label="메모">
                      <p className={styles.resultMemo}>{application.trialResult?.note ?? "기록 없음"}</p>
                    </ResultRow>
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <p className={styles.emptyTitle}>체험 결과가 아직 기록되지 않았습니다.</p>
                    <p className={styles.emptyDescription}>
                      체험 완료 직후 30초 정도면 핵심 내용만 바로 남길 수 있습니다.
                    </p>
                  </div>
                )}
              </section>
            ) : null}

            {shouldShowConsultationSection ? (
              <section className={styles.card} aria-label="상담 이력">
                <div className={styles.sectionHeading}>
                  <div>
                    <h2 className={styles.sectionTitle}>상담 이력</h2>
                    <p className={styles.sectionDescription}>
                      학부모와 상담한 내용을 append-only로 누적해 확인합니다.
                    </p>
                  </div>
                  {canAddConsultation && application.consultationLogs.length > 0 ? (
                    <button type="button" className={styles.ghostButton} onClick={openConsultationEditor}>
                      상담 기록 추가
                    </button>
                  ) : null}
                </div>

                {application.consultationLogs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p className={styles.emptyTitle}>아직 상담 기록이 없습니다.</p>
                    {canAddConsultation ? (
                      <div className={styles.emptyActionRow}>
                        <button type="button" className={styles.primaryButton} onClick={openConsultationEditor}>
                          상담 기록 추가
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className={styles.consultationSummaryCard}>
                    <div className={styles.consultationSummaryRow}>
                      <span className={styles.consultationSummaryLabel}>총 상담 기록</span>
                      <span className={styles.consultationSummaryValue}>
                        총 {application.consultationLogs.length}건의 상담 기록
                      </span>
                    </div>
                    <div className={styles.consultationSummaryRow}>
                      <span className={styles.consultationSummaryLabel}>마지막 상담</span>
                      <span className={styles.consultationSummaryValue}>
                        {latestConsultationLog ? getConsultationMeta(latestConsultationLog) : "기록 없음"}
                      </span>
                    </div>
                    <div className={styles.consultationSummaryActions}>
                      <button type="button" className={styles.secondaryButton} onClick={openConsultationHistory}>
                        상담 내역 보기
                      </button>
                      {canAddConsultation ? (
                        <button type="button" className={styles.primaryButton} onClick={openConsultationEditor}>
                          상담 기록 추가
                        </button>
                      ) : null}
                    </div>
                  </div>
                )}
              </section>
            ) : null}
          </div>

          {sidebarContent ? <div className={styles.prioritySidebar}>{sidebarContent}</div> : null}
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

const ResultRow = ({ label, children }: { label: string; children: ReactNode }) => {
  return (
    <div className={styles.resultRow}>
      <p className={styles.resultLabel}>{label}</p>
      <div className={styles.resultBody}>{children}</div>
    </div>
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
