"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  setParentDecisionAction,
  type SetParentDecisionActionState
} from "@/features/decisions/actions/set-parent-decision"
import {
  PARENT_DECISION_OPTIONS,
  PARENT_DECLINE_REASON_OPTIONS,
  requiresPreferredSchedule,
  type ParentDecision,
  type ParentDeclineReason
} from "@/features/decisions/lib/parent-decision"

import styles from "./parent-decision-form.module.css"

type ParentDecisionFormProps = {
  experienceId: string
  /** 지금 남겨 둔 선택. 없으면 null. */
  currentDecision: ParentDecision | null
  /** declined 일 때만 값이 있다. */
  currentDeclineReason: ParentDeclineReason | null
  currentPreferredDate: string | null
  currentPreferredTimeNote: string | null
  /** 선택을 불러오지 못했을 때의 사유. null 과 구분해야 한다. */
  loadError: string | null
}

const initialState: SetParentDecisionActionState = {
  status: "idle",
  message: "",
  successToken: null
}

export const ParentDecisionForm = ({
  experienceId,
  currentDecision,
  currentDeclineReason,
  currentPreferredDate,
  currentPreferredTimeNote,
  loadError
}: ParentDecisionFormProps) => {
  const router = useRouter()
  const action = setParentDecisionAction.bind(null, experienceId)
  const [state, submit, isPending] = useActionState(action, initialState)
  const [pendingValue, setPendingValue] = useState<ParentDecision | null>(null)
  // "등록하지 않을게요" 는 바로 저장하지 않는다. 이유를 물어야 하기 때문이다.
  const [declineOpen, setDeclineOpen] = useState(currentDecision === "declined")
  const [reason, setReason] = useState<ParentDeclineReason | null>(currentDeclineReason)
  const handledTokenRef = useRef<string | null>(null)

  // 저장되면 서버 값을 다시 읽는다. 화면이 스스로 현재 선택을 지어내지 않는다.
  useEffect(() => {
    if (state.status !== "success" || !state.successToken) {
      return
    }
    if (handledTokenRef.current === state.successToken) {
      return
    }
    handledTokenRef.current = state.successToken
    setPendingValue(null)
    router.refresh()
  }, [state.status, state.successToken, router])

  if (loadError) {
    return (
      <div className={styles.notice} role="status">
        <p className={styles.noticeText}>{loadError}</p>
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.question}>이번 체험 후, 현재 생각은 어떤가요?</p>

      {/*
        고르지 않아도 된다. 강제하지 않고, 화면을 막지도 않는다 —
        아직 정하지 못한 것도 지금의 상태다.
      */}
      <form action={submit} className={styles.options}>
        {PARENT_DECISION_OPTIONS.map((option) => {
          const selected = (pendingValue ?? currentDecision) === option.value
          const isDecline = option.value === "declined"

          return (
            <button
              key={option.value}
              /*
                "등록하지 않을게요" 만 바로 저장하지 않는다.
                이유를 묻고 나서 저장한다 — 이유 없이 닫히면 학원이 할 수 있는 일이 없다.
              */
              type={isDecline ? "button" : "submit"}
              name={isDecline ? undefined : "decision"}
              value={isDecline ? undefined : option.value}
              className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
              aria-pressed={selected}
              aria-expanded={isDecline ? declineOpen : undefined}
              disabled={isPending}
              onClick={() => {
                if (isDecline) {
                  setDeclineOpen(true)
                  return
                }
                setDeclineOpen(false)
                setPendingValue(option.value)
              }}
            >
              <span className={styles.optionMark} aria-hidden="true">
                {selected ? "●" : "○"}
              </span>
              <span className={styles.optionLabel}>{option.label}</span>
            </button>
          )
        })}
      </form>

      {declineOpen ? (
        <form action={submit} className={styles.declinePanel}>
          <input type="hidden" name="decision" value="declined" />

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>어떤 점이 아쉬우셨나요?</legend>
            <div className={styles.reasonList}>
              {PARENT_DECLINE_REASON_OPTIONS.map((option) => (
                <label key={option.value} className={styles.reasonItem}>
                  <input
                    type="radio"
                    name="declineReason"
                    value={option.value}
                    checked={reason === option.value}
                    onChange={() => setReason(option.value)}
                    disabled={isPending}
                    required
                  />
                  <span className={styles.reasonLabel}>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/*
            시간대가 이유일 때만 묻는다. 그 외에는 학원이 할 수 있는 일이 없어서
            묻는 것 자체가 부담이 된다.
          */}
          {requiresPreferredSchedule(reason) ? (
            <div className={styles.scheduleFields}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>언제가 괜찮으세요?</span>
                <input
                  type="date"
                  name="preferredDate"
                  className={styles.input}
                  defaultValue={currentPreferredDate ?? ""}
                  disabled={isPending}
                  required
                />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>희망 시간대 (선택)</span>
                <input
                  type="text"
                  name="preferredTimeNote"
                  className={styles.input}
                  placeholder="예: 오후 4시~6시"
                  defaultValue={currentPreferredTimeNote ?? ""}
                  maxLength={60}
                  disabled={isPending}
                />
              </label>
            </div>
          ) : null}

          <button type="submit" className={styles.declineSubmit} disabled={isPending}>
            이대로 남기기
          </button>
        </form>
      ) : null}

      <p className={styles.hint}>현재 생각은 나중에 바꿀 수 있어요.</p>

      {isPending ? (
        <p className={styles.status} role="status">
          저장 중...
        </p>
      ) : null}

      {state.status === "error" && state.message ? (
        <p className={`${styles.status} ${styles.statusError}`} role="alert">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
