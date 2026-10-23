"use client"

import { startTransition, useActionState, useCallback, useEffect, useId, useState } from "react"
import { useRouter } from "next/navigation"
import { updateApplicationAssigneeAction, type UpdateApplicationAssigneeActionState } from "@/features/studio/actions/update-application-assignee"
import type { StudioTeacherOption } from "@/shared/lib/db/adapter"
import { StudioQueryRetry } from "./studio-query-retry"
import { V2Button } from "./v2/v2-button"
import { V2Dialog } from "./v2/v2-dialog"
import { V2ChevronDownIcon } from "./v2/v2-icons"
import styles from "./application-assignee-control.module.css"

type Props = {
  applicationId: string
  currentAssignedTeacherId: string | null
  currentAssignedTeacherName: string | null
  options: StudioTeacherOption[]
  optionsError?: string | null
}

/** 신청 상세 오른쪽 "담당 선생님". 저장은 기존 updateApplicationAssigneeAction 그대로다. */
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

  return <section className={styles.card} aria-labelledby="assignee-title">
    <div>
      <h3 id="assignee-title" className={styles.title}>담당 선생님</h3>
      <p className={assigned.name ? styles.name : `${styles.name} ${styles.unassigned}`}>{assigned.name ?? "미배정"}</p>
    </div>
    <V2Button variant="outline" size="sm" aria-haspopup="dialog" onClick={() => setOpen(true)}>변경</V2Button>
    {open ? <AssigneeDialog {...props} currentAssignedTeacherId={assigned.id} currentAssignedTeacherName={assigned.name} onCancel={() => setOpen(false)} onSaved={saved} /> : null}
  </section>
}

function AssigneeDialog({ applicationId, currentAssignedTeacherId, currentAssignedTeacherName, options, optionsError, onCancel, onSaved }: Props & {
  onCancel: () => void
  onSaved: (id: string | null, name: string | null) => void
}) {
  const formId = useId()
  const [selectedId, setSelectedId] = useState(currentAssignedTeacherId ?? "")
  const [state, submit, pending] = useActionState(updateApplicationAssigneeAction.bind(null, applicationId), { status: "idle", message: "" } as UpdateApplicationAssigneeActionState)
  useEffect(() => {
    if (state.status === "success") onSaved(selectedId || null, options.find(option => option.teacherId === selectedId)?.teacherName ?? null)
  }, [state, selectedId, options, onSaved])
  const unchanged = selectedId === (currentAssignedTeacherId ?? "")

  return <V2Dialog title="담당 선생님" description={`현재 담당 · ${currentAssignedTeacherName ?? "미배정"}`} width={480} busy={pending} onClose={onCancel}
    footerNote={pending ? "담당 선생님을 저장하고 있어요." : optionsError ? "선생님 목록을 다시 불러온 후 선택해 주세요." : unchanged ? "현재 담당과 같아요. 다른 선생님이나 미배정을 고르면 저장할 수 있어요." : "고른 담당 선생님을 저장해 주세요."}
    footerActions={<V2Button type="submit" form={formId} disabled={pending || Boolean(optionsError) || unchanged}>{pending ? "저장 중..." : "저장"}</V2Button>}>
    <form id={formId} className={styles.form} onSubmit={event => {
      event.preventDefault()
      if (pending || unchanged || optionsError) return
      // Dispatch the existing action without the form-action automatic reset.
      // A failed save must keep the native select and the controlled draft aligned.
      const form = new FormData(event.currentTarget)
      startTransition(() => submit(form))
    }}>
      <label className={styles.field}>
        <span className={styles.label}>선생님 선택</span>
        <span className={styles.selectWrap}>
          <select name="assignedTeacherId" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={pending || Boolean(optionsError)}>
            <option value="">미배정</option>
            {currentAssignedTeacherId && !options.some(option => option.teacherId === currentAssignedTeacherId) ? <option value={currentAssignedTeacherId} disabled>{currentAssignedTeacherName ?? "현재 담당 선생님"} (현재 배정)</option> : null}
            {options.map(option => <option key={option.teacherId} value={option.teacherId}>{option.teacherName}</option>)}
          </select>
          <V2ChevronDownIcon size={16} className={styles.selectIcon} />
        </span>
      </label>
      {optionsError ? <div role="alert" className={styles.messageError}>{optionsError}<StudioQueryRetry /></div> : null}
      {state.status === "error" ? <p role="alert" className={styles.messageError}>{state.message}</p> : null}
    </form>
  </V2Dialog>
}
