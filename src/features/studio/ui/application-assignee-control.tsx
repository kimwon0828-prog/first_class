"use client"

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { updateApplicationAssigneeAction, type UpdateApplicationAssigneeActionState } from "@/features/studio/actions/update-application-assignee"
import type { StudioTeacherOption } from "@/shared/lib/db/adapter"
import { StudioQueryRetry } from "./studio-query-retry"
import styles from "./application-assignee-form.module.css"

type Props = {
  applicationId: string
  currentAssignedTeacherId: string | null
  currentAssignedTeacherName: string | null
  options: StudioTeacherOption[]
  optionsError?: string | null
}

export function ApplicationAssigneeControl(props: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [assigned, setAssigned] = useState({ id: props.currentAssignedTeacherId, name: props.currentAssignedTeacherName })
  useEffect(() => {
    setAssigned({ id: props.currentAssignedTeacherId, name: props.currentAssignedTeacherName })
  }, [props.currentAssignedTeacherId, props.currentAssignedTeacherName])
  const saved = useCallback((id: string | null, name: string | null) => {
    setAssigned({ id, name })
    setOpen(false)
    router.refresh()
  }, [router])

  return <div className={styles.compactControl}>
    <div><span className={styles.compactLabel}>담당 선생님</span><p className={styles.compactName}>{assigned.name ?? "미배정"}</p></div>
    <button type="button" className={styles.changeButton} aria-haspopup="dialog" onClick={() => setOpen(true)}>변경</button>
    {open ? <AssigneeDialog {...props} currentAssignedTeacherId={assigned.id} currentAssignedTeacherName={assigned.name} onCancel={() => setOpen(false)} onSaved={saved} /> : null}
  </div>
}

function AssigneeDialog({ applicationId, currentAssignedTeacherId, currentAssignedTeacherName, options, optionsError, onCancel, onSaved }: Props & {
  onCancel: () => void
  onSaved: (id: string | null, name: string | null) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [selectedId, setSelectedId] = useState(currentAssignedTeacherId ?? "")
  const [state, submit, pending] = useActionState(updateApplicationAssigneeAction.bind(null, applicationId), { status: "idle", message: "" } as UpdateApplicationAssigneeActionState)
  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    const { overflow, paddingRight } = document.body.style
    // Keep the document width unchanged when locking a classic scrollbar.
    const gutter = window.innerWidth - document.documentElement.clientWidth
    if (gutter > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`
    document.body.style.overflow = "hidden"
    dialog?.showModal()
    return () => {
      dialog?.close()
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      previous?.focus()
    }
  }, [])
  useEffect(() => {
    if (state.status === "success") onSaved(selectedId || null, options.find(option => option.teacherId === selectedId)?.teacherName ?? null)
  }, [state, selectedId, options, onSaved])

  return <dialog ref={dialogRef} className={styles.compactDialog} aria-labelledby="assignee-dialog-title" onCancel={event => { event.preventDefault(); if (!pending) onCancel() }}>
    <h2 id="assignee-dialog-title" className={styles.title}>담당 선생님</h2>
    <p className={styles.compactCurrent}><span>현재 담당</span><strong>{currentAssignedTeacherName ?? "미배정"}</strong></p>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault()
      if (pending || selectedId === (currentAssignedTeacherId ?? "") || optionsError) return
      // Dispatch the existing action without the form-action automatic reset.
      // A failed save must keep the native select and the controlled draft aligned.
      const form = new FormData(event.currentTarget)
      startTransition(() => submit(form))
    }}>
      <label className={styles.field}><span className={styles.label}>선생님 선택</span>
        <select name="assignedTeacherId" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={pending || Boolean(optionsError)} className={styles.select}>
          <option value="">미배정</option>
          {currentAssignedTeacherId && !options.some(option => option.teacherId === currentAssignedTeacherId) ? <option value={currentAssignedTeacherId} disabled>{currentAssignedTeacherName ?? "현재 담당 선생님"} (현재 배정)</option> : null}
          {options.map(option => <option key={option.teacherId} value={option.teacherId}>{option.teacherName}</option>)}
        </select>
      </label>
      {optionsError ? <div role="alert" className={`${styles.message} ${styles.messageError}`}>{optionsError}<StudioQueryRetry /></div> : null}
      {state.status === "error" ? <p role="alert" className={`${styles.message} ${styles.messageError}`}>{state.message}</p> : null}
      <div className={styles.compactActions}>
        <button type="button" disabled={pending} className={styles.secondaryButton} onClick={onCancel}>취소</button>
        <button type="submit" disabled={pending || Boolean(optionsError) || selectedId === (currentAssignedTeacherId ?? "")} className={styles.primaryButton}>{pending ? "저장 중..." : "저장"}</button>
      </div>
    </form>
  </dialog>
}
