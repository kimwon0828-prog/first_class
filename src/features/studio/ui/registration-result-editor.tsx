"use client"
import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { saveStudioRegistrationResultAction, type RegistrationSaveState } from "@/features/registration/actions/save-registration-result"
import { REGISTRATION_STATES, registrationReasons } from "@/features/registration/lib/registration-input"
import type { ApplicationRegistrationStatus, StudioApplicationDetail } from "@/shared/lib/db/adapter"
import { STUDIO_REGISTRATION_STATUS_LABELS, getStudioRegistrationStatusTone } from "@/features/studio/lib/application-status-labels"
import { V2Button } from "./v2/v2-button"
import { V2Chip } from "./v2/v2-chip"
import { V2StatusBadge } from "./v2/v2-status-badge"
import styles from "./registration-result-editor.module.css"

/* 선택 카드 아래 짧은 안내(화면 문구). 저장값 · 라벨은 REGISTRATION_STATES 그대로다. */
const STATE_HINTS: Record<ApplicationRegistrationStatus, string> = {
  undecided: "아직 정하지 않았어요",
  pending: "고민하는 이유를 남겨요",
  enrolled: "정규 수업 시작",
  not_enrolled: "이유를 남겨요"
}

/**
 * 등록 결과 (Figma 2148:5579). 저장은 기존 saveStudioRegistrationResultAction 그대로다.
 * startEditing 이면 처음부터 고르는 화면으로 연다("지금 할 일" 카드).
 */
export function RegistrationResultEditor({ application, startEditing = false }: { application: StudioApplicationDetail; startEditing?: boolean }) {
  const router = useRouter()
  const blockReason = application.status !== "completed" || application.noShowAt || application.canceledAt ? "체험 완료된 신청에서 등록 결과를 저장할 수 있어요." : null
  const [editing, setEditing] = useState(startEditing && !blockReason)
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
  const savedReasons = registrationReasons(saved.status).filter(([id]) => saved.reasons.includes(id)).map(([, label]) => label)

  return <section id="registration-result" aria-labelledby="registration-result-title" className={styles.section}>
    <div className={styles.head}>
      {/* "지금 할 일" 카드 안에서는 카드 제목이 같은 말을 해서 제목을 화면 읽기용으로만 둔다(목록 링크의 이동 위치는 유지). */}
      <h3 id="registration-result-title" className={startEditing ? styles.srOnly : styles.title}>등록 결과</h3>
      {!editing ? <V2Button variant="outline" size="sm" disabled={Boolean(blockReason)} aria-describedby={blockReason ? "registration-block" : undefined}
        onClick={() => { setStatus(saved.status); setReasons([...saved.reasons]); setNote(saved.note); setShowMessage(false); setEditing(true) }}>{saved.status === "undecided" ? "등록 결과 입력" : "등록 결과 변경"}</V2Button> : null}
    </div>
    {!editing ? <div className={styles.saved}>
      <V2StatusBadge tone={getStudioRegistrationStatusTone(saved.status)}>{STUDIO_REGISTRATION_STATUS_LABELS[saved.status]}</V2StatusBadge>
      {savedReasons.length ? <p>{savedReasons.join(" · ")}</p> : null}
      {saved.note.trim() ? <p className={styles.note}>{saved.note}</p> : null}
      {blockReason ? <p id="registration-block" className={styles.hint}>{blockReason}</p> : null}
    </div> : null}
    {showMessage && state.message ? <p className={state.status === "error" ? styles.messageError : styles.message} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    {editing ? <form action={submit} className={styles.form} onSubmit={event => { if (pending || inFlight.current || !hasChanged || blockReason) { event.preventDefault(); return }; inFlight.current = true; submitted.current = { status, reasons: [...reasons], note: note.trim() }; setShowMessage(true) }}>
      <div className={styles.options} role="group" aria-label="등록 결과 선택">
        {REGISTRATION_STATES.map(option => <button type="button" key={option.value} disabled={pending} aria-pressed={status === option.value}
          className={status === option.value ? `${styles.option} ${styles.optionSelected}` : styles.option}
          onClick={() => { if (status !== option.value) { setStatus(option.value); setReasons([]) } }}>
          <strong>{option.label}</strong><small>{STATE_HINTS[option.value]}</small>
        </button>)}
      </div>
      <input type="hidden" name="registrationStatus" value={status} />
      {registrationReasons(status).length > 0 ? <fieldset className={styles.reasons}>
        <legend>{status === "pending" ? "고민하는 이유" : "등록하지 않은 이유"} (여러 개 선택)</legend>
        <div className={styles.chips}>{registrationReasons(status).map(([id, label]) => <V2Chip key={id} label={label} disabled={pending} selected={reasons.includes(id)}
          onClick={() => setReasons(prior => prior.includes(id) ? prior.filter(r => r !== id) : [...prior, id])} />)}</div>
      </fieldset> : null}
      {reasons.map(r => <input key={r} type="hidden" name="reasonIds" value={r} />)}
      {showReasons ? <label className={styles.field}>
        <span className={styles.fieldLabel}>메모 (학원만 봐요)</span>
        <textarea name="registrationNote" maxLength={2000} value={note} onChange={e => setNote(e.target.value)} disabled={pending} rows={3} />
      </label> : <input type="hidden" name="registrationNote" value={note} />}
      <div className={styles.actions} role="group" aria-label="등록 결과 편집 버튼">
        <V2Button type="submit" size="lg" disabled={pending || !hasChanged}>{pending ? "저장 중…" : "결과 저장"}</V2Button>
        {!startEditing || saved.status !== "undecided" ? <V2Button variant="ghost" disabled={pending} onClick={() => { setEditing(false); setShowMessage(false) }}>취소</V2Button> : null}
      </div>
    </form> : null}
  </section>
}
