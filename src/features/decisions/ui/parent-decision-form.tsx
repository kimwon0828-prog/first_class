"use client"

import { PARENT_DECISION_OPTIONS, PARENT_DECLINE_REASON_OPTIONS, PREFERRED_DAY_OPTIONS, PREFERRED_TIME_MODE_OPTIONS } from "@/features/decisions/lib/parent-decision"
import { decisionDraftError, type ExperienceDecisionDraft } from "@/features/feedback/lib/experience-submission"
import styles from "./parent-decision-form.module.css"

/** Input fields only. The enclosing experience form owns the one final submission. */
export function ParentDecisionForm({ value, onChange, disabled }: {
  value: ExperienceDecisionDraft
  onChange: (value: ExperienceDecisionDraft) => void
  disabled: boolean
}) {
  const update = (patch: Partial<ExperienceDecisionDraft>) => onChange({ ...value, ...patch })
  const declined = value.decision === "declined"
  const schedule = declined && value.declineReason === "schedule_mismatch"
  const error = decisionDraftError(value)
  return <div className={styles.wrap}>
    <h3 className={styles.question}>이번 체험 후, 현재 생각은 어떤가요?</h3>
    {value.decision ? <input type="hidden" name="decision" value={value.decision} /> : null}
    <div className={styles.options} role="group" aria-label="등록 의향" aria-describedby="decision-input-hint">
      {PARENT_DECISION_OPTIONS.map(option => <button key={option.value} type="button" disabled={disabled}
        className={`${styles.option} ${value.decision === option.value ? styles.optionSelected : ""}`}
        aria-pressed={value.decision === option.value} aria-expanded={option.value === "declined" ? declined : undefined}
        onClick={() => update({ decision: option.value })}>
        <span className={styles.optionMark} aria-hidden="true">{value.decision === option.value ? "●" : "○"}</span>
        <span className={styles.optionLabel}>{option.label}</span>
      </button>)}
    </div>
    {declined ? <div className={styles.declinePanel}>
      <fieldset className={styles.fieldset} disabled={disabled}>
        <legend className={styles.legend}>어떤 점이 아쉬우셨나요?</legend>
        <div className={styles.reasonList}>{PARENT_DECLINE_REASON_OPTIONS.map(option => <label className={styles.reasonItem} key={option.value}>
          <input type="radio" name="declineReason" value={option.value} checked={value.declineReason === option.value} onChange={() => update({ declineReason: option.value })} required />
          <span className={styles.reasonLabel}>{option.label}</span>
        </label>)}</div>
      </fieldset>
      {schedule ? <div className={styles.scheduleFields}>
        <p className={styles.scheduleIntro}>언제가 괜찮으세요?<span className={styles.scheduleHint}>가능한 요일과 시간을 알려주시면 학원에서 맞는 시간을 제안해드려요.</span></p>
        <fieldset className={styles.fieldset} disabled={disabled}><legend className={styles.legend}>가능한 요일</legend>
          <div className={styles.dayChips}>{PREFERRED_DAY_OPTIONS.map(option => <label key={option.value} className={`${styles.dayChip} ${value.preferredDays.includes(option.value) ? styles.dayChipSelected : ""}`}>
            <input type="checkbox" name="preferredDays" value={option.value} className={styles.visuallyHidden} checked={value.preferredDays.includes(option.value)}
              onChange={() => update({ preferredDays: value.preferredDays.includes(option.value) ? value.preferredDays.filter(day => day !== option.value) : [...value.preferredDays, option.value] })} />
            <span aria-hidden="true">{option.label}</span><span className={styles.visuallyHidden}>{option.label}요일</span>
          </label>)}</div>
        </fieldset>
        <label className={styles.field}><span className={styles.fieldLabel}>몇 시쯤 괜찮으세요?</span>
          <input type="time" name="preferredStartTime" className={styles.input} value={value.preferredStartTime} onChange={event => update({ preferredStartTime: event.target.value })} step={600} disabled={disabled} required />
        </label>
        <fieldset className={styles.fieldset} disabled={disabled}><legend className={styles.legend}>그 시간은</legend>
          <div className={styles.reasonList}>{PREFERRED_TIME_MODE_OPTIONS.map(option => <label className={styles.reasonItem} key={option.value}>
            <input type="radio" name="preferredTimeMode" value={option.value} checked={value.preferredTimeMode === option.value} onChange={() => update({ preferredTimeMode: option.value })} />
            <span className={styles.reasonLabel}>{option.label}</span>
          </label>)}</div>
        </fieldset>
        {value.preferredTimeMode === "range" ? <label className={styles.field}><span className={styles.fieldLabel}>언제까지 괜찮으세요?</span>
          <input type="time" name="preferredEndTime" className={styles.input} value={value.preferredEndTime} onChange={event => update({ preferredEndTime: event.target.value })} step={600} disabled={disabled} required />
        </label> : null}
      </div> : null}
    </div> : null}
    <p id="decision-input-hint" className={styles.hint} aria-live="polite">{error ?? "아래 버튼을 눌러야 최종 제출돼요."}</p>
  </div>
}
