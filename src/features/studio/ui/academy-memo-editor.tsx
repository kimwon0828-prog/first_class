"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { saveAcademyMemoAction, type AcademyMemoSaveState } from "@/features/studio/actions/save-academy-memo"
import type { StudioAcademyMemo } from "@/shared/lib/db/adapter"
import { StudioQueryRetry } from "./studio-query-retry"
import { V2Button } from "./v2/v2-button"
import styles from "./academy-memo-editor.module.css"

export type AcademyMemoData = { data: StudioAcademyMemo | null; error: string | null }

export function AcademyMemoEditor({ applicationId, initial, legacyNote, canWrite, blockReason }: {
  applicationId: string; initial: AcademyMemoData; legacyNote: string | null; canWrite: boolean; blockReason: string | null
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(initial.data ? initial.data.note ?? "" : legacyNote ?? "")
  const [editing, setEditing] = useState(false)
  const [editorText, setEditorText] = useState("")
  const handledSave = useRef<string | null>(null)
  const [editorRevision, setEditorRevision] = useState("")
  const [showMessage, setShowMessage] = useState(false)
  const inFlight = useRef(false)
  const [state, submit, pending] = useActionState(async (previous: AcademyMemoSaveState, form: FormData): Promise<AcademyMemoSaveState> => {
    try { return await saveAcademyMemoAction(applicationId, previous, form) }
    catch { return { status: "error", message: "메모를 저장하지 못했어요. 입력 내용은 유지돼요. 연결을 확인하고 다시 시도해 주세요." } }
    finally { inFlight.current = false }
  }, { status: "idle", message: "" })
  // A server refresh never replaces an unsaved draft. Explicit save returns the new revision.
  const [lastSaved, setSaved] = useState<{ value: StudioAcademyMemo; baseRevision: string | undefined } | null>(null)
  const saved = lastSaved && lastSaved.baseRevision === initial.data?.revision ? lastSaved.value : initial.data
  const savedText = saved ? saved.note ?? "" : legacyNote ?? ""
  const changed = editing && draft.trim() !== editorText.trim()
  const disabledReason = initial.error ?? blockReason
  useEffect(() => { if (state.status === "success" && state.saved && handledSave.current !== state.saved.revision) { handledSave.current = state.saved.revision; setSaved({ value: state.saved, baseRevision: initial.data?.revision }); setEditing(false); router.refresh() } }, [state, router, initial.data?.revision])
  useEffect(() => {
    if (!changed) return
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = "" }
    window.addEventListener("beforeunload", unload)
    return () => window.removeEventListener("beforeunload", unload)
  }, [changed])
  return <section id="academy-memo" aria-labelledby="academy-memo-title" className={styles.section}>
    <div className={styles.head}>
      <h3 id="academy-memo-title" className={styles.title}>등록 상담 메모 <small>학부모에게 보이지 않아요</small></h3>
      {!editing ? <V2Button variant="outline" size="sm" disabled={!canWrite || Boolean(disabledReason) || !saved} aria-describedby={disabledReason ? "academy-memo-block" : undefined}
        onClick={() => { setDraft(savedText); setEditorText(savedText); setEditorRevision(saved?.revision ?? ""); setShowMessage(false); setEditing(true) }}>{savedText.trim() ? "수정" : "메모 추가"}</V2Button> : null}
    </div>
    {!editing ? <p className={savedText.trim() ? styles.savedText : styles.empty}>{savedText.trim() ? savedText : "아직 남긴 메모가 없어요."}</p> : null}
    {disabledReason ? <p id="academy-memo-block" role="alert" className={styles.hint}>{disabledReason}{initial.error ? <StudioQueryRetry /> : null}</p> : null}
    {showMessage && state.message ? <p className={state.status === "error" ? styles.messageError : styles.message} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    {editing ? <form action={submit} onSubmit={event => { if (inFlight.current || pending || !changed || !canWrite || disabledReason || !saved) { event.preventDefault(); return }; inFlight.current = true; setShowMessage(true) }}>
      <div className={styles.field}>
        <textarea className={styles.textarea} name="note" rows={4} maxLength={10000} value={draft} onChange={event => setDraft(event.target.value)}
          aria-label="등록 상담 메모 (선택)" aria-describedby={disabledReason ? "academy-memo-block" : undefined} readOnly={!canWrite || Boolean(disabledReason)} disabled={pending} />
      </div>
      <input type="hidden" name="expectedRevision" value={editorRevision} />
      <div className={styles.actions} role="group" aria-label="등록 상담 메모 편집 버튼">
        <V2Button variant="ghost" size="sm" disabled={pending} onClick={() => { setEditing(false); setDraft(savedText); setShowMessage(false) }}>취소</V2Button>
        <V2Button type="submit" variant="tonal" size="sm" aria-describedby={disabledReason ? "academy-memo-block" : undefined} disabled={pending || !canWrite || Boolean(disabledReason) || !saved || !changed}>{pending ? "저장 중…" : "메모 저장"}</V2Button>
      </div>
    </form> : null}
  </section>
}
