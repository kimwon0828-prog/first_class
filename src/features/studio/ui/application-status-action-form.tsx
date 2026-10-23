"use client"

import Link from "next/link"
import { useActionState, useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import type { ApplicationStatus, ApplicationStatusActionType, StudioTeacherOption } from "@/shared/lib/db/adapter"

import { StudioQueryRetry } from "./studio-query-retry"
import { v2ButtonClassName } from "./v2/v2-button"
import { V2ChevronDownIcon } from "./v2/v2-icons"
import styles from "./application-status-action-form.module.css"

const initialState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: "",
  completedPromptToken: null
}

type ActionButtonConfig = {
  actionType: ApplicationStatusActionType
  label: string
  tone: "primary" | "quiet"
}

/* 상태별로 할 수 있는 일. 허용 상태 · 다음 상태는 서버 액션(update-application-status)이 정한다 — 여기는 버튼만. */
const ACTIONS_BY_STATUS: Record<ApplicationStatus, ActionButtonConfig[]> = {
  new: [
    { actionType: "move_to_confirmed", label: "이 일정으로 확정", tone: "primary" },
    { actionType: "cancel", label: "신청 취소", tone: "quiet" }
  ],
  reviewing: [
    { actionType: "move_to_confirmed", label: "이 일정으로 확정", tone: "primary" },
    { actionType: "cancel", label: "신청 취소", tone: "quiet" }
  ],
  confirmed: [
    { actionType: "move_to_completed", label: "체험 완료", tone: "primary" },
    { actionType: "no_show", label: "불참 처리", tone: "quiet" }
  ],
  completed: [],
  canceled: []
}

type ApplicationStatusActionFormProps = {
  applicationId: string
  currentStatus: ApplicationStatus
  onCompletedSaved?: () => void
  /** 예전 화면 구분값. 지금은 신청 상세 "지금 할 일" 카드 한 모양만 있다. */
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
  const teacherSelectId = useId()
  const action = updateApplicationStatusAction.bind(null, applicationId)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const handledPromptTokenRef = useRef<string | null>(null)
  const completedSavedHandlerRef = useRef(onCompletedSaved)
  const availableActions = ACTIONS_BY_STATUS[currentStatus]

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

  if (!showActions || availableActions.length === 0) {
    return null
  }

  return (
    <form action={formAction} className={styles.form} aria-label="지금 할 일 상태 변경">
      {state.message ? (
        <div role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? styles.messageError : styles.message}>
          {state.message}
        </div>
      ) : null}

      {confirmation ? (
        <>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>체험 시간</span>
            <div className={styles.times}>
              {/* 확정은 학부모가 고른 시간 그대로다. 다른 시간 고르기 · 제안은 지금 기능이 없다. */}
              <span className={styles.timeCard}>
                <strong>{confirmation.requestedSchedule}</strong>
                <small>학부모 희망 · 이 시간으로 확정해요</small>
              </span>
            </div>
            {!confirmation.hasSchedule ? (
              <p className={styles.messageError} role="status">
                확정할 수 있는 일정이 없어요. <Link href={confirmation.scheduleHref}>일정 관리</Link>에서 확인해 주세요.
              </p>
            ) : null}
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor={teacherSelectId}>담당 선생님</label>
            <span className={styles.selectWrap}>
              <select
                id={teacherSelectId}
                name="assignedTeacherId"
                value={selectedTeacher}
                disabled={isPending}
                onChange={(event) => setSelectedTeacher(event.target.value)}
              >
                <option value="">미배정</option>
                {confirmation.teachers.map((teacher) => (
                  <option key={teacher.teacherId} value={teacher.teacherId}>{teacher.teacherName}</option>
                ))}
              </select>
              <V2ChevronDownIcon size={16} className={styles.selectIcon} />
            </span>
            <p className={styles.helper}>비워 두고 나중에 배정해도 돼요.</p>
            {confirmation.teachersError ? <div role="alert" className={styles.messageError}>{confirmation.teachersError}<StudioQueryRetry /></div> : null}
          </div>
        </>
      ) : null}

      <div className={styles.buttons}>
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
              item.tone === "primary"
                ? v2ButtonClassName({ variant: primaryTone === "secondary" ? "outline" : "primary", size: "lg" })
                : v2ButtonClassName({ variant: "ghost", size: "md", className: styles.quietAction })
            }
          >
            {isPending ? "처리 중..." : item.label}
          </button>
        ))}
      </div>
      <button ref={noShowSubmitRef} type="submit" name="actionType" value="no_show" hidden disabled={isPending} />
      <dialog ref={dialogRef} className={styles.confirmDialog} aria-labelledby={dialogTitleId} aria-describedby={dialogDescriptionId}>
        <h2 id={dialogTitleId}>이 학생을 불참으로 처리할까요?</h2>
        <p id={dialogDescriptionId}>불참 처리 후에는 기존 정책에 따라 되돌릴 수 없습니다.</p>
        <div className={styles.confirmActions}>
          <button type="button" autoFocus className={v2ButtonClassName({ variant: "outline" })} onClick={() => dialogRef.current?.close()}>돌아가기</button>
          <button type="button" className={`${v2ButtonClassName({ variant: "primary" })} ${styles.dangerButton}`} disabled={isPending} onClick={() => {
            dialogRef.current?.close()
            noShowSubmitRef.current?.click()
          }}>불참 처리</button>
        </div>
      </dialog>
    </form>
  )
}
