"use client"

import type { ReactNode } from "react"
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import { upsertTrialResultAction, type UpsertTrialResultActionState } from "@/features/studio/actions/upsert-trial-result"
import {
  getTrialResultRegistrationLabel,
  getTrialResultUnregisteredReasonLabel,
  TRIAL_RESULT_OBSERVATION_OPTIONS,
  TRIAL_RESULT_REGISTRATION_OPTIONS,
  TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS
} from "@/features/studio/lib/trial-result-options"
import { ApplicationStatusActionForm } from "@/features/studio/ui/application-status-action-form"
import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

import styles from "./application-trial-result-workflow.module.css"

const initialTrialResultState: UpsertTrialResultActionState = {
  status: "idle",
  message: "",
  successToken: null
}

type ApplicationTrialResultWorkflowProps = {
  application: StudioApplicationDetail
  nextActionDescription: string
  sidebarContent?: ReactNode
}

export const ApplicationTrialResultWorkflow = ({
  application,
  nextActionDescription,
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

  const action = upsertTrialResultAction.bind(null, application.id)
  const [trialResultState, trialResultFormAction, isSavingTrialResult] = useActionState(
    action,
    initialTrialResultState
  )
  const handledSuccessTokenRef = useRef<string | null>(null)

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

  const resetFormSelections = () => {
    setSelectedObservations(application.trialResult?.observations ?? [])
    setSelectedRegistrationStatus(application.registrationStatus)
    setSelectedUnregisteredReason(application.unregisteredReason ?? null)
    setUnregisteredReasonNote(application.unregisteredReasonNote ?? "")
  }

  const openEditor = (options?: { refreshAfterClose?: boolean }) => {
    resetFormSelections()
    setIsPromptOpen(false)
    setIsSuccessOpen(false)
    setRefreshOnEditorClose(Boolean(options?.refreshAfterClose))
    setIsEditorOpen(true)
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

  const closeSuccessModal = () => {
    setIsSuccessOpen(false)

    if (refreshOnEditorClose) {
      setRefreshOnEditorClose(false)
    }

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

    if (handledSuccessTokenRef.current === trialResultState.successToken) {
      return
    }

    handledSuccessTokenRef.current = trialResultState.successToken
    setIsEditorOpen(false)
    setIsPromptOpen(false)
    setIsSuccessOpen(true)
  }, [trialResultState.status, trialResultState.successToken])

  const hasTrialResult = Boolean(application.trialResult)
  const shouldShowTrialResultSection = application.status === "completed" || hasTrialResult
  const registrationLabel = getTrialResultRegistrationLabel(application.registrationStatus)
  const unregisteredReasonLabel = getTrialResultUnregisteredReasonLabel(application.unregisteredReason)
  const handleCompletedSaved = useCallback(() => {
    setIsPromptOpen(true)
  }, [])

  return (
    <>
      <section className={styles.card} aria-label="다음에 할 일">
        <div className={styles.sectionHeading}>
          <div>
            <h2 className={styles.sectionTitle}>다음에 할 일</h2>
            <p className={styles.sectionDescription}>{nextActionDescription}</p>
          </div>
        </div>

        <div className={styles.todoBody}>
          {application.status === "canceled" ? (
            <div className={styles.todoNotice}>이미 종료된 신청이라 추가 상태 변경은 필요하지 않습니다.</div>
          ) : (
            <ApplicationStatusActionForm
              applicationId={application.id}
              currentStatus={application.status}
              onCompletedSaved={handleCompletedSaved}
            />
          )}
        </div>
      </section>

      {shouldShowTrialResultSection || sidebarContent ? (
        <div className={styles.priorityGrid}>
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
