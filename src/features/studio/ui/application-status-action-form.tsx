"use client"

import { useEffect, useRef, useId, useState } from "react"
import { useActionState } from "react"
import { useRouter } from "next/navigation"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import type { ApplicationStatus, ApplicationStatusActionType, StudioTeacherOption } from "@/shared/lib/db/adapter"

import Link from "next/link"
import { StudioQueryRetry } from "./studio-query-retry"

import styles from "./application-status-action-form.module.css"

const initialState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: "",
  completedPromptToken: null
}

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  new: "신청 접수",
  reviewing: "신청 접수",
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
    { actionType: "move_to_confirmed", label: "일정 확정하기", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  reviewing: [
    { actionType: "move_to_confirmed", label: "일정 확정하기", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  confirmed: [
    { actionType: "move_to_completed", label: "체험 완료", tone: "primary" },
    { actionType: "no_show", label: "노쇼 처리", tone: "danger" }
  ],
  completed: [],
  canceled: []
}

const CASE_DETAIL_ACTIONS_BY_STATUS: Record<ApplicationStatus, ActionButtonConfig[]> = {
  new: [
    { actionType: "move_to_confirmed", label: "일정 확정하기", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  reviewing: [
    { actionType: "move_to_confirmed", label: "일정 확정하기", tone: "primary" },
    { actionType: "cancel", label: "취소 처리", tone: "danger" }
  ],
  confirmed: [
    { actionType: "move_to_completed", label: "체험 완료", tone: "primary" },
    { actionType: "no_show", label: "노쇼 처리", tone: "danger" }
  ],
  completed: [],
  canceled: []
}

type ApplicationStatusActionFormProps = {
  applicationId: string
  currentStatus: ApplicationStatus
  onCompletedSaved?: () => void
  variant?: "default" | "case-detail"
  primaryTone?: "primary" | "secondary"
  showActions?: boolean
  confirmation?: {
    requestedSchedule: string
    hasSchedule: boolean
    assignedTeacherId: string | null
    teachers: StudioTeacherOption[]
    teachersError: string | null
    scheduleHref: string
  }
}

export const ApplicationStatusActionForm = ({
  applicationId,
  currentStatus,
  onCompletedSaved,
  variant = "default",
  primaryTone = "primary",
  showActions = true,
  confirmation
}: ApplicationStatusActionFormProps) => {
  const router = useRouter()
  const [selectedTeacher, setSelectedTeacher] = useState(confirmation?.assignedTeacherId ?? "")
  const dialogRef = useRef<HTMLDialogElement>(null)
  const noShowSubmitRef = useRef<HTMLButtonElement>(null)
  const dialogTitleId = useId()
  const dialogDescriptionId = useId()
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
        className={`${styles.form} ${isCaseDetail ? styles.compactForm : ""} ${confirmation ? styles.confirmationForm : ""}`}
        aria-label={isCaseDetail ? "다음 할 일 상태 변경" : undefined}
      >
        {state.message ? (
          <div role={state.status === "error" ? "alert" : "status"} className={`${styles.message} ${state.status === "error" ? styles.messageError : ""}`}>
            {state.message}
          </div>
        ) : null}

        {confirmation ? <>
          <div className={styles.scheduleGrid}>
            <div className={styles.requestedSchedule}><span>학부모 희망 일정</span><strong>{confirmation.requestedSchedule}</strong></div>
            <div className={styles.confirmedSchedule}><span>확정 일정</span><strong>{confirmation.requestedSchedule}</strong><small>기존 희망 일정으로 확정합니다.</small></div>
          </div>
          {!confirmation.hasSchedule ? <div className={styles.message} role="status">확정 가능한 일정이 없습니다. <Link href={confirmation.scheduleHref}>일정 관리</Link></div> : null}
          <fieldset className={styles.teacherField} disabled={isPending}>
            <legend>담당 선생님 <span>(선택)</span></legend>
            <p>선생님을 선택하지 않아도 일정 확정이 가능해요.</p>
            {confirmation.teachersError ? <div role="alert">{confirmation.teachersError}<StudioQueryRetry /></div> : null}
            <div className={styles.teacherOptions}>
              {[{ teacherId: "", teacherName: "미배정" }, ...confirmation.teachers].map(teacher => <label key={teacher.teacherId} className={styles.teacherOption} data-selected={selectedTeacher === teacher.teacherId}>
                <input type="radio" name="assignedTeacherId" value={teacher.teacherId} checked={selectedTeacher === teacher.teacherId} onChange={() => setSelectedTeacher(teacher.teacherId)} />
                <span>{teacher.teacherName}</span>
              </label>)}
            </div>
          </fieldset>
        </> : null}
        <div className={`${styles.buttonGroup} ${isCaseDetail ? styles.compactButtonGroup : ""}`}>
          {availableActions.map((item) => (
            <button
              key={item.actionType}
              type={item.actionType === "no_show" ? "button" : "submit"}
              onClick={item.actionType === "no_show" ? (event) => {
                event.preventDefault()
                dialogRef.current?.showModal()
              } : undefined}
              name="actionType"
              value={item.actionType}
              disabled={isPending || (item.actionType === "move_to_confirmed" && Boolean(confirmation && !confirmation.hasSchedule))}
              className={
                item.tone === "danger"
                  ? styles.dangerButton
                  : item.tone === "secondary" || primaryTone === "secondary"
                    ? styles.secondaryButton
                    : styles.primaryButton
              }
            >
              {isPending ? "처리 중..." : item.label}
            </button>
          ))}
        </div>
        <button ref={noShowSubmitRef} type="submit" name="actionType" value="no_show" hidden disabled={isPending} />
        <dialog ref={dialogRef} className={styles.confirmDialog} aria-labelledby={dialogTitleId} aria-describedby={dialogDescriptionId}>
          <h2 id={dialogTitleId}>이 학생을 노쇼로 처리할까요?</h2>
          <p id={dialogDescriptionId}>노쇼 처리 후에는 기존 정책에 따라 되돌릴 수 없습니다.</p>
          <div className={styles.confirmActions}>
            <button type="button" autoFocus className={styles.secondaryButton} onClick={() => dialogRef.current?.close()}>돌아가기</button>
            <button type="button" className={styles.dangerButton} disabled={isPending} onClick={() => {
              dialogRef.current?.close()
              noShowSubmitRef.current?.click()
            }}>노쇼 처리</button>
          </div>
        </dialog>
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
