"use client"

import { useEffect, useRef } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import type { ApplicationStatus, ApplicationStatusActionType } from "@/shared/lib/db/adapter"

import styles from "./application-status-action-form.module.css"

const initialState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: "",
  completedPromptToken: null
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "신규 신청",
  reviewing: "확인 중",
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
    { actionType: "move_to_confirmed", label: "일정 확정", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  reviewing: [
    { actionType: "move_to_confirmed", label: "일정 확정", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  confirmed: [
    { actionType: "move_to_completed", label: "체험 완료", tone: "primary" },
    { actionType: "no_show", label: "노쇼 처리", tone: "secondary" }
  ],
  completed: [],
  canceled: []
}

const CASE_DETAIL_ACTIONS_BY_STATUS: Record<ApplicationStatus, ActionButtonConfig[]> = {
  new: [
    { actionType: "move_to_confirmed", label: "일정 확정", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  reviewing: [
    { actionType: "move_to_confirmed", label: "일정 확정", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  confirmed: [
    { actionType: "move_to_completed", label: "체험 완료", tone: "primary" },
    { actionType: "no_show", label: "노쇼 처리", tone: "secondary" }
  ],
  completed: [],
  canceled: []
}

type ApplicationStatusActionFormProps = {
  applicationId: string
  currentStatus: ApplicationStatus
  onCompletedSaved?: () => void
  variant?: "default" | "case-detail"
  showActions?: boolean
}

export const ApplicationStatusActionForm = ({
  applicationId,
  currentStatus,
  onCompletedSaved,
  variant = "default",
  showActions = true
}: ApplicationStatusActionFormProps) => {
  const router = useRouter()
  const action = updateApplicationStatusAction.bind(null, applicationId)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const handledPromptTokenRef = useRef<string | null>(null)
  const completedSavedHandlerRef = useRef(onCompletedSaved)

  const isCaseDetail = variant === "case-detail"
  const availableActions = isCaseDetail
    ? CASE_DETAIL_ACTIONS_BY_STATUS[currentStatus]
    : ACTIONS_BY_STATUS[currentStatus]
  const statusLabel = STATUS_LABELS[currentStatus]

  useEffect(() => {
    completedSavedHandlerRef.current = onCompletedSaved
  }, [onCompletedSaved])

  useEffect(() => {
    if (state.status !== "success") {
      return
    }

    if (state.completedPromptToken) {
      if (handledPromptTokenRef.current === state.completedPromptToken) {
        return
      }

      handledPromptTokenRef.current = state.completedPromptToken
      completedSavedHandlerRef.current?.()
      return
    }

    router.refresh()
  }, [router, state.completedPromptToken, state.status])

  const actionContent =
    availableActions.length === 0 ? (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>처리가 종료된 신청입니다.</p>
        <p className={styles.emptyDescription}>현재 상태에서는 추가 상태 변경이 필요하지 않아요.</p>
      </div>
    ) : (
      <form
        action={formAction}
        className={`${styles.form} ${isCaseDetail ? styles.compactForm : ""}`}
        aria-label={isCaseDetail ? "다음 할 일 상태 변경" : undefined}
      >
        {state.message ? (
          <div className={`${styles.message} ${state.status === "error" ? styles.messageError : ""}`}>
            {state.message}
          </div>
        ) : null}

        <div className={`${styles.buttonGroup} ${isCaseDetail ? styles.compactButtonGroup : ""}`}>
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
    )

  if (isCaseDetail) {
    return showActions && availableActions.length > 0 ? actionContent : null
  }

  return (
    <section className={styles.card} aria-label="상태 관리">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>상태 관리</h2>
        </div>
      </div>

      <div className={styles.currentRow}>
        <span className={styles.currentLabel}>현재 상태</span>
        <span className={styles.currentValue}>{statusLabel}</span>
      </div>

      {actionContent}
    </section>
  )
}
