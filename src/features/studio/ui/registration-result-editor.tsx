"use client"
import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { saveStudioRegistrationResultAction, type RegistrationSaveState } from "@/features/registration/actions/save-registration-result"
import { REGISTRATION_STATES, registrationReasons } from "@/features/registration/lib/registration-input"
import type { ApplicationRegistrationStatus, StudioApplicationDetail } from "@/shared/lib/db/adapter"
import styles from "./application-trial-result-workflow.module.css"
import { STUDIO_REGISTRATION_STATUS_LABELS } from "@/features/studio/lib/application-status-labels"
import { ApplicationDetailIcon } from "./application-detail-icon"

export function RegistrationResultEditor({ application }: { application: StudioApplicationDetail }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [showMessage, setShowMessage] = useState(false)
  const source = { status: application.registrationStatus, reasons: application.registrationReasonIds ?? [], note: application.registrationNote ?? "" }
  const sourceKey = JSON.stringify(source)
  const [lastSaved, setLastSaved] = useState<{ value: typeof source; baseKey: string } | null>(null)
  const saved = lastSaved?.baseKey === sourceKey ? lastSaved.value : source
  const submitted = useRef<typeof source | null>(null)
  const handledSave = useRef<string | undefined>(undefined)
  const inFlight = useRef(false)
  const [status, setStatus] = useState<ApplicationRegistrationStatus>(application.registrationStatus)
  const [reasons, setReasons] = useState(application.registrationReasonIds ?? [])
  const [note, setNote] = useState(application.registrationNote ?? "")
  const hasChanged = status !== saved.status ||
    JSON.stringify([...reasons].sort()) !== JSON.stringify([...saved.reasons].sort()) ||
    note.trim() !== saved.note.trim()
  const showReasons = status === "pending" || status === "not_enrolled"
  const [state, submit, pending] = useActionState(async (previous: RegistrationSaveState, form: FormData): Promise<RegistrationSaveState> => {
    try { return await saveStudioRegistrationResultAction(application.id, previous, form) }
    catch { return { status: "error", message: "등록 결과를 저장하지 못했어요. 입력을 유지했으니 다시 시도해 주세요." } }
    finally { inFlight.current = false }
  }, { status: "idle", message: "" } as RegistrationSaveState)
  useEffect(() => { if (state.status === "success" && submitted.current && state.token !== handledSave.current) { handledSave.current = state.token; setLastSaved({ value: submitted.current, baseKey: sourceKey }); setEditing(false); router.refresh() } }, [state.token, state.status, router, sourceKey])
  const blockReason = application.status !== "completed" || application.noShowAt || application.canceledAt ? "체험 완료된 신청에서 등록 결과를 저장할 수 있어요." : null
  return <section aria-labelledby="registration-result-title" className={styles.registrationSection}>
    <div className={styles.operationHead}>
      <h3 id="registration-result-title" className={styles.sectionTitle}><ApplicationDetailIcon name="registration" />등록 결과</h3>
      {!editing ? <button type="button" className={styles.viewEditButton} disabled={Boolean(blockReason)} aria-describedby={blockReason ? "registration-block" : undefined}
        onClick={() => { setStatus(saved.status); setReasons([...saved.reasons]); setNote(saved.note); setShowMessage(false); setEditing(true) }}>{saved.status === "undecided" ? "등록 결과 입력" : "등록 결과 변경"}</button> : null}
    </div>
    {!editing ? <>
      <p className={styles.savedText}><strong>{STUDIO_REGISTRATION_STATUS_LABELS[saved.status]}</strong></p>
      {saved.reasons.length ? <p className={styles.savedText}>{registrationReasons(saved.status).filter(([id]) => saved.reasons.includes(id)).map(([, label]) => label).join(" · ")}</p> : null}
      {saved.note.trim() ? <p className={styles.savedText}>{saved.note}</p> : null}

      {blockReason ? <p id="registration-block" className={styles.fieldHint}>{blockReason}</p> : null}
    </> : null}
    {showMessage && state.message ? <p role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    {editing ? <form action={submit} className={styles.registrationForm} onSubmit={event => { if (pending || inFlight.current || !hasChanged || blockReason) { event.preventDefault(); return }; inFlight.current = true; submitted.current = { status, reasons: [...reasons], note: note.trim() }; setShowMessage(true) }}>
      <div className={styles.selectionWrap} role="group" aria-label="등록 결과 선택">{REGISTRATION_STATES.map(s => <button type="button" key={s.value} disabled={pending} aria-pressed={status === s.value} className={`${styles.choiceChip} ${status === s.value ? styles.choiceChipActive : ""}`} onClick={() => { if (status !== s.value) { setStatus(s.value); setReasons([]) } }}>{STUDIO_REGISTRATION_STATUS_LABELS[s.value]}</button>)}</div>
      <input type="hidden" name="registrationStatus" value={status} />
      {registrationReasons(status).length > 0 ? <fieldset className={styles.reasonFieldset}><legend>{status === "pending" ? "고민중인 이유" : "등록하지 않은 이유"} · 복수 선택</legend><div className={styles.selectionWrap}>{registrationReasons(status).map(([id, label]) => <button key={id} type="button" disabled={pending} aria-pressed={reasons.includes(id)} className={`${styles.choiceChip} ${reasons.includes(id) ? styles.choiceChipActive : ""}`} onClick={() => setReasons(prior => prior.includes(id) ? prior.filter(r => r !== id) : [...prior, id])}>{label}</button>)}</div></fieldset> : null}
      {reasons.map(r => <input key={r} type="hidden" name="reasonIds" value={r} />)}
      {showReasons ? <label className={styles.field}><span className={styles.fieldLabel}>추가 메모 (선택)</span><textarea className={styles.textarea} name="registrationNote" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} disabled={pending} rows={3} /></label>
        : <input type="hidden" name="registrationNote" value={note} />}
      <div className={styles.editorActions} role="group" aria-label="등록 결과 편집 버튼">
        <button type="button" className={styles.secondaryButton} disabled={pending} onClick={() => { setEditing(false); setShowMessage(false) }}>취소</button>
        <button type="submit" disabled={pending || !hasChanged} className={styles.primaryButton}>{pending ? "저장 중…" : "등록 결과 저장"}</button>
      </div>
    </form> : null}
  </section>
}
