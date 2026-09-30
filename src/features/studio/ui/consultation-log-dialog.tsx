"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { createConsultationLogAction, type CreateConsultationLogActionState } from "@/features/studio/actions/create-consultation-log"
import { CONSULTATION_CHANNEL_OPTIONS, CONSULTATION_SENTIMENT_OPTIONS } from "@/features/studio/lib/consultation-log-options"
import { formatSeoulDateTimeInputValue } from "@/features/studio/lib/seoul-datetime"
import { MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS, parseRegularSchedulePreference, validateRegularSchedulePreference, type IsoWeekday, type RegularSchedulePreferenceGroup } from "@/features/studio/lib/regular-schedule-preference"
import { REGULAR_SCHEDULE_PREFERENCE_FIELD, REGULAR_SCHEDULE_PREFERENCE_NOTE_FIELD } from "@/features/studio/lib/regular-schedule-preference-input"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"
import styles from "./consultation-log-dialog.module.css"

const DAYS = ["월", "화", "수", "목", "금", "토", "일"]
// Same half-hour options as the existing schedule preference editor.
const TIMES = Array.from({ length: 34 }, (_, index) => `${String(7 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 ? "30" : "00"}`)
const FLEXIBILITY = [
  ["exact", "해당 시간만 가능"], ["plus_minus_30", "±30분 가능"],
  ["same_day_flexible", "같은 요일이면 시간 조정 가능"], ["flexible", "요일·시간 협의 가능"]
] as const
type Row = { key: string; group: RegularSchedulePreferenceGroup }
const candidate = (rows: Row[]) => ({ version: 1, state: "specified", groups: rows.map(row => row.group) })
const errorLabel = (code: string) => code === "selected_days_required" ? "요일을 선택해 주세요."
  : code === "time_range_reversed" ? "종료 시간은 시작 시간보다 뒤여야 해요."
  : code === "duplicate_preference_group" ? "같은 희망 시간이 이미 있어요."
  : "올바른 시작·종료 시간을 선택해 주세요."

export function ConsultationLogDialog({ application, onCancel, onSaved }: {
  application: StudioApplicationDetail; onCancel: () => void; onSaved: (message: string) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inFlight = useRef(false)
  const [submissionId] = useState(() => crypto.randomUUID())
  const [channel, setChannel] = useState("")
  const [sentiment, setSentiment] = useState("")
  const [occurredAt, setOccurredAt] = useState(() => formatSeoulDateTimeInputValue(new Date().toISOString()))
  const [note, setNote] = useState("")
  const [flexibility, setFlexibility] = useState("")
  const [additionalNote, setAdditionalNote] = useState(application.regularSchedulePreferenceNote ?? "")
  const [initial] = useState(() => parseRegularSchedulePreference(application.regularSchedulePreference))
  const [rows, setRows] = useState<Row[]>(() => initial.status === "valid" ? initial.value.groups.map(group => ({ key: crypto.randomUUID(), group })) : [])
  const [scheduleTouched, setScheduleTouched] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [state, submit, pending] = useActionState(createConsultationLogAction.bind(null, application.id), {
    status: "idle", message: "", successToken: null
  } as CreateConsultationLogActionState)
  const unavailable = initial.status === "corrupt" || initial.status === "unreadable_version"
  const preferenceChanged = scheduleTouched || additionalNote !== (application.regularSchedulePreferenceNote ?? "")
  const validation = rows.length ? validateRegularSchedulePreference(candidate(rows)) : null
  const blocked = (validation && !validation.ok) || (unavailable && !scheduleTouched && preferenceChanged)

  useEffect(() => {
    const dialog = dialogRef.current
    const previous = document.activeElement as HTMLElement | null
    const { overflow, paddingRight } = document.body.style
    const gutter = window.innerWidth - document.documentElement.clientWidth
    if (gutter > 0) document.body.style.paddingRight = `${parseFloat(getComputedStyle(document.body).paddingRight) + gutter}px`
    dialog?.showModal()
    document.body.style.overflow = "hidden"
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialog) return
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]"))
        .filter(element => !element.matches(":disabled") && element.tabIndex >= 0 && element.getClientRects().length > 0)
      const target = event.shiftKey && document.activeElement === controls[0] ? controls.at(-1)
        : !event.shiftKey && document.activeElement === controls.at(-1) ? controls[0] : null
      if (target) { event.preventDefault(); target.focus() }
    }
    dialog?.addEventListener("keydown", trapFocus)
    return () => {
      dialog?.removeEventListener("keydown", trapFocus)
      dialog?.close()
      document.body.style.overflow = overflow
      document.body.style.paddingRight = paddingRight
      previous?.focus()
    }
  }, [])

  useEffect(() => {
    inFlight.current = false
    if (state.status === "success" && state.successToken) onSaved(state.message)
  }, [state, onSaved])

  const updateRow = (key: string, group: RegularSchedulePreferenceGroup) => {
    setScheduleTouched(true)
    setRows(current => current.map(row => row.key === key ? { ...row, group } : row))
  }
  const removeRow = (key: string) => {
    setScheduleTouched(true)
    setRows(current => current.filter(row => row.key !== key))
    if (rows.length === 1 && flexibility !== "flexible") setFlexibility("")
  }

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="consultation-editor-title" aria-describedby="consultation-editor-description" onCancel={event => { event.preventDefault(); if (!pending && !inFlight.current) onCancel() }}>
    <header className={styles.header}>
      <div><h3 id="consultation-editor-title">상담 기록 추가</h3><p id="consultation-editor-description">학부모와 나눈 내용을 간단히 기록해 주세요.</p></div>
      <button type="button" className={styles.close} aria-label="닫기" disabled={pending} onClick={onCancel}>×</button>
    </header>
    <form className={styles.form} onSubmit={event => {
      event.preventDefault()
      if (pending || inFlight.current) return
      setAttempted(true)
      if (!channel || !sentiment || !note.trim() || blocked) {
        requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('fieldset[aria-invalid="true"] button, input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]')?.focus())
        return
      }
      const data = new FormData(event.currentTarget)
      data.set("submissionId", submissionId)
      data.set("channel", channel)
      data.set("sentiment", sentiment)
      data.set("timeFlexibility", flexibility)
      // Absent fields preserve the current preference and next_contact_at on the server.
      // Explicitly removing all rows sends the existing null contract, never a fabricated undecided.
      if (preferenceChanged) {
        const preference = rows.length && validation?.ok ? validation.value
          : !scheduleTouched && initial.status === "valid" ? initial.value : null
        data.set(REGULAR_SCHEDULE_PREFERENCE_FIELD, preference ? JSON.stringify(preference) : "")
        data.set(REGULAR_SCHEDULE_PREFERENCE_NOTE_FIELD, additionalNote)
      }
      inFlight.current = true
      // Avoid React form-action resets so every draft survives a failed server response.
      startTransition(() => submit(data))
    }}>
      <div className={styles.body}>
        <fieldset className={styles.group} disabled={pending} aria-invalid={attempted && !channel}>
          <legend>상담 방식</legend>
          <div className={styles.chips}>{CONSULTATION_CHANNEL_OPTIONS.map(item => <button type="button" key={item.value} aria-pressed={channel === item.value} onClick={() => setChannel(item.value)}>{item.label}</button>)}</div>
          {attempted && !channel ? <p className={styles.error}>상담 방식을 선택해 주세요.</p> : null}
        </fieldset>
        <label className={styles.field} htmlFor="contact-occurred-at"><span>상담 일시</span><input id="contact-occurred-at" type="datetime-local" name="occurredAt" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} required disabled={pending} /></label>
        <fieldset className={styles.group} disabled={pending} aria-invalid={attempted && !sentiment}>
          <legend>학부모 반응</legend>
          <div className={styles.chips}>{CONSULTATION_SENTIMENT_OPTIONS.map(item => <button type="button" key={item.value} aria-pressed={sentiment === item.value} onClick={() => setSentiment(item.value)}>{item.label}</button>)}</div>
          {attempted && !sentiment ? <p className={styles.error}>학부모 반응을 선택해 주세요.</p> : null}
        </fieldset>
        <label className={styles.field} htmlFor="contact-note"><span>상담 내용</span><textarea id="contact-note" aria-label="상담 내용" name="note" rows={3} value={note} onChange={event => setNote(event.target.value)} placeholder="학부모와 나눈 핵심 내용을 간단히 기록해 주세요." required aria-invalid={attempted && !note.trim()} disabled={pending} /></label>
        <section className={styles.schedule} aria-labelledby="contact-schedule-title">
          <h4 id="contact-schedule-title">희망 일정 <span>· 선택</span></h4>
          <p className={styles.hint}>다음 상담이나 등록을 원하는 시간이 있다면 추가해 주세요.</p>
          {unavailable ? <p className={styles.hint}>기존 일정 형식을 표시할 수 없어요. 새 희망 시간을 추가하기 전까지 원본을 유지해요.</p> : null}
          {initial.status === "valid" && initial.value.state === "undecided" && !scheduleTouched ? <p className={styles.hint}>기존 희망 일정: 아직 미정</p> : null}
          {rows.map((row, index) => {
            const { group } = row
            const ownValidation = validateRegularSchedulePreference(candidate([row]))
            const rowError = !ownValidation.ok ? errorLabel(ownValidation.code) : validation && !validation.ok && validation.groupIndex === index ? errorLabel(validation.code) : null
            const showError = Boolean(rowError && (attempted || scheduleTouched))
            const dayValue = group.dayMode === "any" ? "any" : group.days.length > 1 ? "stored" : String(group.days[0] ?? "")
            const timeOptions = (value: string | null) => [...new Set([...(value ? [value] : []), ...TIMES])].sort().map(time => <option key={time} value={time}>{time}</option>)
            return <div key={row.key} className={styles.rowGroup}>
              <div className={styles.row}>
                <select aria-label={`희망 요일 ${index + 1}`} aria-invalid={showError} aria-describedby={showError ? `contact-row-error-${row.key}` : undefined} value={dayValue} disabled={pending} onChange={event => {
                  const value = event.target.value
                  if (value === "stored") return
                  updateRow(row.key, { ...group, ...(value === "any" ? { dayMode: "any", days: [] } : { dayMode: "selected", days: value ? [Number(value) as IsoWeekday] : [] }) } as RegularSchedulePreferenceGroup)
                }}>
                  <option value="">요일</option>
                  {DAYS.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}
                  {group.days.length > 1 ? <option value="stored">{group.days.map(day => DAYS[day - 1]).join("·")}</option> : null}
                  <option value="any">요일 무관</option>
                </select>
                {group.timeMode === "range" || group.timeMode === "after" ? <select aria-label={`시작 시간 ${index + 1}`} aria-invalid={showError} aria-describedby={showError ? `contact-row-error-${row.key}` : undefined} value={group.startTime} disabled={pending} onChange={event => updateRow(row.key, { ...group, startTime: event.target.value })}>
                  <option value="">시작</option>{timeOptions(group.startTime)}
                </select> : <span className={styles.hint}>{group.timeMode === "any" ? "시간 무관" : "시작 무관"}</span>}
                <span className={styles.separator}>{group.timeMode === "range" ? "~" : group.timeMode === "after" ? "이후" : group.timeMode === "before" ? "~" : ""}</span>
                {group.timeMode === "range" || group.timeMode === "before" ? <select aria-label={`종료 시간 ${index + 1}`} aria-invalid={showError} aria-describedby={showError ? `contact-row-error-${row.key}` : undefined} value={group.endTime} disabled={pending} onChange={event => updateRow(row.key, { ...group, endTime: event.target.value })}>
                  <option value="">종료</option>{timeOptions(group.endTime)}
                </select> : <span />}
                <button type="button" className={styles.textButton} aria-label={`희망 시간 ${index + 1} 삭제`} disabled={pending} onClick={() => removeRow(row.key)}>삭제</button>
              </div>
              {showError ? <p className={styles.error} id={`contact-row-error-${row.key}`} role="alert">{rowError}</p> : null}
            </div>
          })}
          <button type="button" className={styles.addButton} disabled={pending || rows.length >= MAX_REGULAR_SCHEDULE_PREFERENCE_GROUPS} onClick={() => {
            setRows(current => [...current, { key: crypto.randomUUID(), group: { dayMode: "selected", days: [], timeMode: "range", startTime: "", endTime: "" } }])
          }}>+ 희망 시간 추가</button>
          {!rows.length && flexibility === "flexible" ? <p className={styles.hint}>요일·시간 협의 가능 <button type="button" className={styles.textButton} disabled={pending} onClick={() => setFlexibility("")}>해제</button></p> : null}
        </section>
        {rows.length ? <label className={styles.field} htmlFor="contact-flexibility"><span>시간 조정 가능 범위</span><select id="contact-flexibility" value={flexibility} disabled={pending} onChange={event => setFlexibility(event.target.value)}><option value="">선택 안 함</option>{FLEXIBILITY.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label> : null}
        <label className={`${styles.field} ${styles.secondary}`} htmlFor="contact-additional-note"><span>추가 메모 · 선택</span><textarea id="contact-additional-note" aria-label="추가 메모 · 선택" rows={2} value={additionalNote} disabled={pending} onChange={event => setAdditionalNote(event.target.value)} placeholder="목요일은 피아노 수업 때문에 18시 이후만 가능" /></label>
        {unavailable && !scheduleTouched && preferenceChanged ? <p className={styles.error} role="alert">기존 일정을 확인할 수 없어 추가 메모를 변경할 수 없어요. 메모를 원래대로 되돌리거나 희망 시간을 직접 추가해 주세요.</p> : null}
      </div>
      <footer className={styles.footer}>
        {state.status === "error" ? <p className={styles.error} role="alert">{state.message}</p> : null}
        <div className={styles.actions}>
          <button type="button" disabled={pending} onClick={onCancel}>취소</button>
          <button type="submit" className={styles.primary} disabled={pending}>{pending ? "저장 중..." : "저장하기"}</button>
        </div>
      </footer>
    </form>
  </dialog>
}
