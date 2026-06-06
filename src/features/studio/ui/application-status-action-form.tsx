"use client"

import { useActionState } from "react"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

import styles from "./application-status-action-form.module.css"

const initialState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: ""
}

const STATUS_ACTION_LABELS: Record<ApplicationStatus, string> = {
  new: "신규",
  reviewing: "검토 중으로 변경",
  confirmed: "확정으로 변경",
  completed: "완료로 변경",
  canceled: "취소"
}

type ApplicationStatusActionFormProps = {
  applicationId: string
  nextStatus: ApplicationStatus | null
  currentStatus: ApplicationStatus
  registrationStatus: string
}

export const ApplicationStatusActionForm = ({
  applicationId,
  nextStatus,
  currentStatus
}: ApplicationStatusActionFormProps) => {
  const action =
    nextStatus == null
      ? async (previousState: UpdateApplicationStatusActionState) => previousState
      : updateApplicationStatusAction.bind(null, applicationId, nextStatus)
  const [state, formAction, isPending] = useActionState(action, initialState)

  const statusLabel =
    currentStatus === "new"
      ? "신규 신청"
      : currentStatus === "reviewing"
        ? "검토 중"
        : currentStatus === "confirmed"
          ? "수업 확정"
          : currentStatus === "completed"
            ? "수업 완료"
            : "취소"

  return (
    <section className={styles.card} aria-label="상태 관리">
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>상태 관리</h2>
          <p className={styles.description}>허용된 다음 단계만 처리할 수 있어요.</p>
        </div>
      </div>

      <div className={styles.currentRow}>
        <span className={styles.currentLabel}>현재 상태</span>
        <span className={styles.currentValue}>{statusLabel}</span>
      </div>

      {!nextStatus ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>추가 상태 변경이 필요하지 않아요.</p>
          <p className={styles.emptyDescription}>취소/완료 상태이거나, 이미 최종 단계입니다.</p>
        </div>
      ) : (
        <form action={formAction} className={styles.form}>
          {state.message ? (
            <div className={`${styles.message} ${state.status === "error" ? styles.messageError : ""}`}>
              {state.message}
            </div>
          ) : null}

          <button type="submit" disabled={isPending} className={styles.primaryButton}>
            {isPending ? "처리 중..." : STATUS_ACTION_LABELS[nextStatus]}
          </button>
        </form>
      )}
    </section>
  )
}
