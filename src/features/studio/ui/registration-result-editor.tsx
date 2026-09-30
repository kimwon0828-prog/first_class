"use client"
import { useActionState, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { saveStudioRegistrationResultAction, type RegistrationSaveState } from "@/features/registration/actions/save-registration-result"
import { REGISTRATION_STATES, registrationReasons } from "@/features/registration/lib/registration-input"
import type { ApplicationRegistrationStatus, StudioApplicationDetail } from "@/shared/lib/db/adapter"
import styles from "./application-trial-result-workflow.module.css"
import { ApplicationDetailIcon } from "./application-detail-icon"

export function RegistrationResultEditor({ application }: { application: StudioApplicationDetail }) {
  const router = useRouter()
  const [status, setStatus] = useState<ApplicationRegistrationStatus>(application.registrationStatus)
  const [reasons, setReasons] = useState(application.registrationReasonIds ?? [])
  const [note, setNote] = useState(application.registrationNote ?? "")
  const hasChanged = status !== application.registrationStatus ||
    JSON.stringify([...reasons].sort()) !== JSON.stringify([...(application.registrationReasonIds ?? [])].sort()) ||
    note.trim() !== (application.registrationNote ?? "").trim()
  const showReasons = status === "pending" || status === "not_enrolled"
  const [state, submit, pending] = useActionState(saveStudioRegistrationResultAction.bind(null, application.id), { status: "idle", message: "" } as RegistrationSaveState)
  useEffect(() => { if (state.status === "success") router.refresh() }, [state.token, state.status, router])
  return <section aria-labelledby="registration-result-title" className={styles.registrationSection}>
    <h3 id="registration-result-title" className={styles.sectionTitle}><ApplicationDetailIcon name="registration" />등록 결과</h3>
    <p className={styles.fieldHint}>학원에서 확인한 실제 결과입니다. 상담·학부모 의향과 별도로 저장하며 이후 변경할 수 있어요.</p>
    <form action={submit} className={styles.registrationForm} onSubmit={event => { if (pending || !hasChanged) event.preventDefault() }}>
      <div className={styles.selectionWrap} role="group" aria-label="등록 결과 선택">{REGISTRATION_STATES.map(s => <button type="button" key={s.value} disabled={pending} aria-pressed={status === s.value} className={`${styles.choiceChip} ${status === s.value ? styles.choiceChipActive : ""}`} onClick={() => { if (status !== s.value) { setStatus(s.value); setReasons([]) } }}>{s.label}</button>)}</div>
      <input type="hidden" name="registrationStatus" value={status} />
      {registrationReasons(status).length > 0 ? <fieldset className={styles.reasonFieldset}><legend>{status === "pending" ? "고민 중 이유" : "미등록 이유"} · 복수 선택</legend><div className={styles.selectionWrap}>{registrationReasons(status).map(([id, label]) => <button key={id} type="button" disabled={pending} aria-pressed={reasons.includes(id)} className={`${styles.choiceChip} ${reasons.includes(id) ? styles.choiceChipActive : ""}`} onClick={() => setReasons(prior => prior.includes(id) ? prior.filter(r => r !== id) : [...prior, id])}>{label}</button>)}</div></fieldset> : null}
      {reasons.map(r => <input key={r} type="hidden" name="reasonIds" value={r} />)}
      {showReasons ? <label className={styles.field}><span className={styles.fieldLabel}>추가 메모 (선택)</span><textarea className={styles.textarea} name="registrationNote" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} disabled={pending} rows={3} /></label>
        : <input type="hidden" name="registrationNote" value={note} />}
      {state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
      <div className={styles.registrationActions}><button type="submit" disabled={pending || !hasChanged} className={hasChanged ? styles.primaryButton : styles.secondaryButton}>{pending ? "저장 중..." : "등록 결과 저장"}</button></div>
    </form>
  </section>
}
