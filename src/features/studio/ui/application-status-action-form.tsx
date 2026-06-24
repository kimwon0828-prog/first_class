"use client"

import { useActionState } from "react"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import type { ApplicationStatus, ApplicationStatusActionType } from "@/shared/lib/db/adapter"

import styles from "./application-status-action-form.module.css"

const initialState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: ""
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "신규 신청",
  reviewing: "상담/확인 중",
  confirmed: "일정 확정",
  completed: "체험 완료",
  canceled: "처리 종료"
}

type ActionButtonConfig = {
  actionType: ApplicationStatusActionType
  label: string
  tone: "primary" | "danger" | "secondary"
}

const ACTIONS_BY_STATUS: Record<ApplicationStatus, ActionButtonConfig[]> = {
  new: [
    { actionType: "move_to_reviewing", label: "상담/확인 중으로 변경", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  reviewing: [
    { actionType: "move_to_confirmed", label: "일정 확정으로 변경", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  confirmed: [
    { actionType: "move_to_completed", label: "체험 완료", tone: "primary" },
    { actionType: "no_show", label: "노쇼 처리", tone: "secondary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  completed: [],
  canceled: []
}

type ApplicationStatusActionFormProps = {
  applicationId: string
  currentStatus: ApplicationStatus
}

export const ApplicationStatusActionForm = ({ applicationId, currentStatus }: ApplicationStatusActionFormProps) => {
  const action = updateApplicationStatusAction.bind(null, applicationId)
  const [state, formAction, isPending] = useActionState(action, initialState)

  const availableActions = ACTIONS_BY_STATUS[currentStatus]
  const statusLabel = STATUS_LABELS[currentStatus]

  return (
    <section className={styles.card} aria-label="상태 관리">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>상태 관리</h2>
          <p className={styles.description}>현재 상태에서 가능한 작업만 표시합니다.</p>
        </div>
      </div>

      <div className={styles.currentRow}>
        <span className={styles.currentLabel}>현재 상태</span>
        <span className={styles.currentValue}>{statusLabel}</span>
      </div>

      {availableActions.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>추가 상태 변경이 필요하지 않아요.</p>
          <p className={styles.emptyDescription}>완료 또는 취소 상태라서 더 이상 변경할 수 없어요.</p>
        </div>
      ) : (
        <form action={formAction} className={styles.form}>
          {state.message ? (
            <div className={`${styles.message} ${state.status === "error" ? styles.messageError : ""}`}>
              {state.message}
            </div>
          ) : null}

          <div className={styles.buttonGroup}>
            {availableActions.map((item) => (
              <button
                key={item.actionType}
                type="submit"
                name="actionType"
                value={item.actionType}
                disabled={isPending}
                className={
                  item.tone === "danger"
                    ? styles.dangerButton
                    : item.tone === "secondary"
                      ? styles.secondaryButton
                      : styles.primaryButton
                }
              >
                {isPending ? "처리 중..." : item.label}
              </button>
            ))}
          </div>
        </form>
      )}
    </section>
  )
}
