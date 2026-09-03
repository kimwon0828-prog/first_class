"use client"

import { useActionState, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  updateConsultationLogAction,
  type UpdateConsultationLogActionState
} from "@/features/studio/actions/update-consultation-log"
import {
  CONSULTATION_CHANNEL_OPTIONS,
  CONSULTATION_SENTIMENT_OPTIONS,
  getConsultationChannelLabel,
  getConsultationSentimentLabel
} from "@/features/studio/lib/consultation-log-options"
import {
  formatSeoulDateTime,
  formatSeoulDateTimeInputValue
} from "@/features/studio/lib/seoul-datetime"
import {
  formatRegularSchedulePreference,
  parseRegularSchedulePreference
} from "@/features/studio/lib/regular-schedule-preference"
import { RegularSchedulePreferenceEditor } from "@/features/studio/ui/regular-schedule-preference-editor"
import type { StudioConsultationLog } from "@/shared/lib/db/adapter"

import styles from "./application-trial-result-workflow.module.css"

const initialUpdateState: UpdateConsultationLogActionState = {
  status: "idle",
  message: "",
  successToken: null
}

type ConsultationHistoryModalProps = {
  applicationId: string
  logs: StudioConsultationLog[]
  isOpen: boolean
  canAddConsultation: boolean
  onClose: () => void
  onAddConsultation: () => void
}

const isEditedLog = (item: StudioConsultationLog) => {
  return new Date(item.updatedAt).getTime() > new Date(item.createdAt).getTime()
}

const getConsultationMeta = (item: StudioConsultationLog) => {
  if (item.activityType === "LEGACY_IMPORT") {
    return "이전 기록"
  }

  const occurredAt = formatSeoulDateTime(item.occurredAt)
  const channelLabel = getConsultationChannelLabel(item.channel)

  return [occurredAt, channelLabel].filter((value): value is string => Boolean(value)).join(" · ")
}

export const ConsultationHistoryModal = ({
  applicationId,
  logs,
  isOpen,
  canAddConsultation,
  onClose,
  onAddConsultation
}: ConsultationHistoryModalProps) => {
  const router = useRouter()
  const [editingLogId, setEditingLogId] = useState<string | null>(null)
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null)

  const editingLog = useMemo(
    () => logs.find((item) => item.id === editingLogId) ?? null,
    [editingLogId, logs]
  )

  useEffect(() => {
    if (!isOpen) {
      setEditingLogId(null)
      setConfirmationMessage(null)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  return (
    <div className={styles.dialogOverlay} role="presentation">
      <div className={styles.dialogCardWide} role="dialog" aria-modal="true" aria-labelledby="consultation-history-title">
        <button type="button" className={styles.dialogClose} aria-label="닫기" onClick={onClose}>
          닫기
        </button>

        <div className={styles.dialogBody}>
          <h3 id="consultation-history-title" className={styles.dialogTitle}>
            상담 내역
          </h3>
          <p className={styles.dialogDescription}>
            최근 상담부터 확인할 수 있어요.
          </p>
        </div>

        {editingLog ? (
          <ConsultationHistoryEditor
            applicationId={applicationId}
            log={editingLog}
            onCancel={() => setEditingLogId(null)}
            onSaved={(message) => {
              setEditingLogId(null)
              setConfirmationMessage(message)
              router.refresh()
            }}
          />
        ) : (
          <div className={styles.form}>
            {confirmationMessage ? (
              <div className={`${styles.message} ${styles.messageSuccess}`}>{confirmationMessage}</div>
            ) : null}

            <div className={styles.consultationHistoryList}>
              {logs.map((item) => (
                <article
                  key={item.id}
                  className={`${styles.consultationHistoryItem} ${
                    item.activityType === "LEGACY_IMPORT" ? styles.consultationHistoryItemLegacy : ""
                  }`}
                >
                  <div className={styles.consultationHistoryHeader}>
                    <div>
                      <p className={styles.consultationHistoryMeta}>{getConsultationMeta(item)}</p>
                      {isEditedLog(item) ? (
                        <span className={styles.consultationHistoryEditedBadge}>수정됨</span>
                      ) : null}
                    </div>
                    {item.activityType === "CONSULTATION" ? (
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => {
                          setConfirmationMessage(null)
                          setEditingLogId(item.id)
                        }}
                      >
                        수정
                      </button>
                    ) : null}
                  </div>

                  {item.activityType === "CONSULTATION" && item.sentiment ? (
                    <span className={styles.consultationSentimentBadge}>
                      {getConsultationSentimentLabel(item.sentiment)}
                    </span>
                  ) : null}

                  <p className={styles.consultationHistoryNote}>
                    {item.note ??
                      (item.activityType === "LEGACY_IMPORT"
                        ? "과거 방식에서 이관된 상담 내용"
                        : "기록 없음")}
                  </p>

                  {/*
                    그 상담 시점의 희망 일정. 읽을 수 없는 값이어도 화면을 죽이지 않고
                    "표시할 수 없음" 으로 알린다 — 원본은 그대로 둔다.
                  */}
                  {(() => {
                    const parsed = parseRegularSchedulePreference(
                      item.regularSchedulePreferenceSnapshot
                    )

                    if (parsed.status === "empty") {
                      return null
                    }

                    return (
                      <div className={styles.consultationNextContact}>
                        <span className={styles.consultationNextContactLabel}>희망 일정</span>
                        <span className={styles.consultationNextContactValue}>
                          {parsed.status === "valid"
                            ? formatRegularSchedulePreference(parsed.value)
                            : "표시할 수 없는 기록"}
                          {parsed.status === "valid" && item.regularSchedulePreferenceNoteSnapshot
                            ? ` · ${item.regularSchedulePreferenceNoteSnapshot}`
                            : ""}
                        </span>
                      </div>
                    )
                  })()}

                  {item.nextContactAt ? (
                    <div className={styles.consultationNextContact}>
                      <span className={styles.consultationNextContactLabel}>다음 연락</span>
                      <span className={styles.consultationNextContactValue}>
                        {formatSeoulDateTime(item.nextContactAt)}
                      </span>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>

            <div className={styles.dialogActions}>
              {canAddConsultation ? (
                <button type="button" className={styles.secondaryButton} onClick={onAddConsultation}>
                  상담 기록 추가
                </button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const ConsultationHistoryEditor = ({
  applicationId,
  log,
  onCancel,
  onSaved
}: {
  applicationId: string
  log: StudioConsultationLog
  onCancel: () => void
  onSaved: (message: string) => void
}) => {
  const [selectedChannel, setSelectedChannel] = useState(log.channel ?? "")
  const [selectedSentiment, setSelectedSentiment] = useState(log.sentiment ?? "")
  const [note, setNote] = useState(log.note ?? "")
  const [nextContactAt, setNextContactAt] = useState(formatSeoulDateTimeInputValue(log.nextContactAt))
  const handledSuccessTokenRef = useRef<string | null>(null)

  const updateAction = updateConsultationLogAction.bind(null, applicationId, log.id)
  const [state, formAction, isPending] = useActionState(updateAction, initialUpdateState)

  useEffect(() => {
    if (state.status !== "success" || !state.successToken) {
      return
    }

    if (handledSuccessTokenRef.current === state.successToken) {
      return
    }

    handledSuccessTokenRef.current = state.successToken
    onSaved(state.message)
  }, [onSaved, state.message, state.status, state.successToken])

  return (
    <form action={formAction} className={styles.form}>
      {state.message ? (
        <div className={`${styles.message} ${state.status === "error" ? styles.messageError : styles.messageSuccess}`}>
          {state.message}
        </div>
      ) : null}

      <section className={styles.formSection}>
        <div className={styles.formHeader}>
          <h4 className={styles.formTitle}>상담 방식</h4>
          <p className={styles.formDescription}>실제 연락한 방식을 선택해 주세요.</p>
        </div>
        <div className={styles.selectionWrap}>
          {CONSULTATION_CHANNEL_OPTIONS.map((item) => {
            const selected = selectedChannel === item.value
            return (
              <button
                key={item.value}
                type="button"
                className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                onClick={() => setSelectedChannel(item.value)}
                disabled={isPending}
              >
                {item.label}
              </button>
            )
          })}
          <input type="hidden" name="channel" value={selectedChannel} />
        </div>
      </section>

      <section className={styles.formSection}>
        <div className={styles.formHeader}>
          <h4 className={styles.formTitle}>학부모 반응</h4>
          <p className={styles.formDescription}>이번 상담 분위기를 선택해 주세요.</p>
        </div>
        <div className={styles.selectionWrap}>
          {CONSULTATION_SENTIMENT_OPTIONS.map((item) => {
            const selected = selectedSentiment === item.value
            return (
              <button
                key={item.value}
                type="button"
                className={`${styles.choiceChip} ${selected ? styles.choiceChipActive : ""}`}
                onClick={() => setSelectedSentiment(item.value)}
                disabled={isPending}
              >
                {item.label}
              </button>
            )
          })}
          <input type="hidden" name="sentiment" value={selectedSentiment} />
        </div>
        <p className={styles.fieldHelp}>
          긍정적: 등록 의향이 느껴졌어요. 보통: 아직 판단하기 어려워요. 부정적: 등록 가능성이 낮아
          보여요.
        </p>
      </section>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>상담 내용</span>
        <textarea
          name="note"
          rows={4}
          className={styles.textarea}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={isPending}
        />
      </label>

      <RegularSchedulePreferenceEditor
        currentPreference={log.regularSchedulePreferenceSnapshot}
        currentNote={log.regularSchedulePreferenceNoteSnapshot}
        disabled={isPending}
      />

      <label className={styles.field}>
        <span className={styles.fieldLabel}>다음 연락일</span>
        <input
          type="datetime-local"
          name="nextContactAt"
          value={nextContactAt}
          onChange={(event) => setNextContactAt(event.target.value)}
          className={styles.input}
          disabled={isPending}
        />
      </label>

      <div className={styles.dialogActions}>
        <button type="button" className={styles.secondaryButton} onClick={onCancel} disabled={isPending}>
          목록으로
        </button>
        <button type="submit" className={styles.primaryButton} disabled={isPending}>
          {isPending ? "저장 중..." : "수정 저장"}
        </button>
      </div>
    </form>
  )
}
