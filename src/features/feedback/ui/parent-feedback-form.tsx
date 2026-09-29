"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ParentDecisionForm } from "@/features/decisions/ui/parent-decision-form"
import type { MyParentDecisionResult } from "@/features/decisions/queries/get-my-current-parent-decision"
import { formatPreferredSchedule, formatLegacyPreferredDate, getParentDecisionLabel, getParentDeclineReasonLabel } from "@/features/decisions/lib/parent-decision"
import { submitParentExperienceAction, type FeedbackActionState } from "../actions/save-parent-feedback"
import { feedbackChipsForProgram, feedbackChipLabel, validateFeedbackInput, type FeedbackChipId, type ParentFeedbackResult } from "../lib/experience-feedback"
import { decisionDraftError, emptyExperienceDecision } from "../lib/experience-submission"
import styles from "./feedback.module.css"

const initialState: FeedbackActionState = { status: "idle", message: "" }
export function ParentFeedbackForm({ applicationId, result, decisionResult, showDecision, showTitle = true }: {
  applicationId: string; result: ParentFeedbackResult; decisionResult: MyParentDecisionResult; showDecision: boolean; showTitle?: boolean
}) {
  const router = useRouter()
  const context = result.status === "ok" ? result.context : null
  const saved = context?.feedback ?? null
  const decision = decisionResult.status === "ok" ? decisionResult.decision : null
  const [selected, setSelected] = useState<FeedbackChipId[]>([])
  const [note, setNote] = useState("")
  const [draft, setDraft] = useState(emptyExperienceDecision)
  const [state, submit, pending] = useActionState(submitParentExperienceAction.bind(null, applicationId), initialState)
  const sending = useRef(false)
  useEffect(() => {
    sending.current = false
    if (state.status === "success") router.refresh()
  }, [state, router])
  const complete = Boolean(saved && decision)
  const Container = complete ? "div" : "form"
  const locked = complete || pending || state.status === "success" || state.code === "duplicate"
  const readable = Boolean(context && decisionResult.status === "ok")
  const feedbackError = !saved && context?.programType ? validateFeedbackInput(context.programType, selected, note) : null
  const canSubmit = readable && context?.eligible && !locked && !feedbackError && Boolean(decision || (showDecision && !decisionDraftError(draft)))
  const options = context?.programType ? feedbackChipsForProgram(context.programType) : []
  const categories = [...new Set(options.map(chip => chip.category))]
  const toggle = (id: FeedbackChipId) => setSelected(current => current.includes(id) ? current.filter(item => item !== id) : current.length < 5 ? [...current, id] : current)
  const schedule = decision ? formatPreferredSchedule({ days: decision.preferredDays, startTime: decision.preferredStartTime, endTime: decision.preferredEndTime, mode: decision.preferredTimeMode }) ?? (decision.preferredDate ? formatLegacyPreferredDate(decision.preferredDate, decision.preferredTimeNote) : null) : null
  return <div className={styles.section}>
    {showTitle ? <h2 className={styles.title}>체험은 어떠셨나요?</h2> : null}
    <Container action={complete ? undefined : submit} className={styles.form} aria-busy={pending} onSubmit={event => {
      event.preventDefault()
      if (!(event.currentTarget instanceof HTMLFormElement) || !canSubmit || sending.current) return
      sending.current = true
      const formData = new FormData(event.currentTarget)
      // Dispatch explicitly: native action reset must not clear failed radio/checkbox drafts.
      startTransition(() => submit(formData))
    }}>
      <div data-parent-feedback>
        {!context ? <div role="status"><p className={styles.description}>피드백을 불러오지 못했어요. 다시 확인해 주세요.</p><button type="button" className={styles.secondary} onClick={() => router.refresh()}>다시 불러오기</button></div>
          : saved ? <div className={styles.saved}>
            <p className={styles.count}>보낸 피드백</p>
            {saved.selectedChipIds.length > 0 ? <ul className={styles.chips} aria-label="선택한 항목">{saved.selectedChipIds.map(id => <li className={styles.tag} key={id}>{feedbackChipLabel(id)}</li>)}</ul> : null}
            {saved.privateNote ? <div><span className={styles.label}>학원에 전한 의견</span><p className={styles.privateNote}>{saved.privateNote}</p><p className={styles.hint}>의견은 해당 학원에만 전달돼요.</p></div> : null}
          </div>
          : !context.eligible ? <p className={styles.description}>체험을 마친 신청에서 피드백을 남길 수 있어요.</p>
            : <div className={styles.form}>
              <p className={styles.description}>해당되는 항목을 최대 5개까지 골라주세요.</p>
              <p className={styles.count} aria-live="polite">선택 {selected.length}/5</p>
              {selected.map(id => <input type="hidden" name="chip" value={id} key={id} />)}
              {categories.map(category => <fieldset className={styles.group} key={category} disabled={locked}>
                <legend>{category}</legend><div className={styles.chips}>
                  {options.filter(chip => chip.category === category).map(chip => <button type="button" key={chip.id} className={styles.chip}
                    aria-pressed={selected.includes(chip.id)} disabled={locked || (selected.length >= 5 && !selected.includes(chip.id))} onClick={() => toggle(chip.id)}>{chip.label}</button>)}
                </div>
              </fieldset>)}
              <div><label htmlFor={`feedback-note-${applicationId}`} className={styles.label}>학원에 전하고 싶은 의견이 있나요?</label>
                <textarea id={`feedback-note-${applicationId}`} name="privateNote" value={note} onChange={event => setNote(event.target.value)} maxLength={1000} readOnly={locked} className={styles.note} placeholder="좋았던 점이나 아쉬웠던 점을 편하게 남겨주세요." aria-describedby={`feedback-privacy-${applicationId}`} />
                <p id={`feedback-privacy-${applicationId}`} className={styles.hint}>의견은 해당 학원에만 전달돼요.</p>
                <p className={styles.hint}>{Array.from(note).length}/1000</p>
                {feedbackError ? <p className={styles.hint}>{feedbackError}</p> : null}
              </div>
            </div>}
      </div>
      <div id="decision-title" className={styles.decisionDivider}>
        {decisionResult.status !== "ok" ? <div role="status"><h3 className={styles.title}>이번 체험 후, 현재 생각은 어떤가요?</h3><p className={styles.description}>선택 정보를 불러오지 못했어요. 다시 확인해 주세요.</p><button type="button" className={styles.secondary} onClick={() => router.refresh()}>선택 다시 불러오기</button></div>
          : decision ? <div className={styles.saved}>
            <h3 className={styles.title}>이번 체험 후, 현재 생각은 어떤가요?</h3>
            <p className={styles.count}>{getParentDecisionLabel(decision.decision)}</p>
            {decision.declineReason ? <p className={styles.description}>{getParentDeclineReasonLabel(decision.declineReason)}</p> : null}
            {schedule ? <p className={styles.hint}>가능 일정 · {schedule}</p> : null}
            {!saved ? <p className={styles.hint}>이미 남긴 등록 의향은 유지돼요. 피드백만 한 번 보낼 수 있어요.</p> : null}
          </div>
            : showDecision ? <ParentDecisionForm value={draft} onChange={setDraft} disabled={locked} />
              : <p className={styles.description}>현재 이 신청에는 등록 의향을 남길 수 없어요.</p>}
      </div>
      {complete ? <p className={styles.count} role="status">피드백을 보냈어요. 제출한 내용은 수정할 수 없어요.</p> : <>
        {state.status === "error" ? <p role="alert" className={styles.error}>{state.message}</p> : null}
        {state.status === "success" ? <p role="status" className={styles.count}>피드백을 보냈어요. 저장한 내용을 확인하고 있어요.</p> : null}
        {!readable ? <p className={styles.hint}>피드백과 선택 정보를 모두 불러온 뒤 제출할 수 있어요.</p> : null}
        {state.status === "success" || state.code === "duplicate" ? <button type="button" className={styles.secondary} onClick={() => router.refresh()}>보낸 내용 확인하기</button> : <>
          <p className={styles.hint}>보내고 나면 수정할 수 없어요.</p>
          <button type="submit" className={styles.button} disabled={!canSubmit}>{pending ? "보내는 중…" : "피드백 보내기"}</button>
        </>}
      </>}
    </Container>
  </div>
}
