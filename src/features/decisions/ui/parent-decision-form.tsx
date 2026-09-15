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
  PREFERRED_DAY_OPTIONS,
  PREFERRED_TIME_MODE_OPTIONS,
  requiresPreferredEndTime,
  requiresPreferredSchedule,
  type ParentDecision,
  type ParentDeclineReason,
  type PreferredDay,
  type PreferredTimeMode
} from "@/features/decisions/lib/parent-decision"

import styles from "./parent-decision-form.module.css"

type ParentDecisionFormProps = {
  experienceId: string
  /** 지금 남겨 둔 선택. 없으면 null. */
  currentDecision: ParentDecision | null
  /** declined 일 때만 값이 있다. */
  currentDeclineReason: ParentDeclineReason | null
  /** 시간대가 이유일 때만 값이 있다. 날짜가 아니라 평소 가능한 패턴이다. */
  currentPreferredDays: PreferredDay[] | null
  currentPreferredStartTime: string | null
  currentPreferredEndTime: string | null
  currentPreferredTimeMode: PreferredTimeMode | null
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
  currentPreferredDays,
  currentPreferredStartTime,
  currentPreferredEndTime,
  currentPreferredTimeMode,
  loadError
}: ParentDecisionFormProps) => {
  const router = useRouter()
  const action = setParentDecisionAction.bind(null, experienceId)
  const [state, submit, isPending] = useActionState(action, initialState)
  const [pendingValue, setPendingValue] = useState<ParentDecision | null>(null)
  // "등록하지 않을게요" 는 바로 저장하지 않는다. 이유를 물어야 하기 때문이다.
  const [declineOpen, setDeclineOpen] = useState(currentDecision === "declined")
  const [reason, setReason] = useState<ParentDeclineReason | null>(currentDeclineReason)
  const [days, setDays] = useState<PreferredDay[]>(currentPreferredDays ?? [])
  const [timeMode, setTimeMode] = useState<PreferredTimeMode>(currentPreferredTimeMode ?? "after")
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
              {/*
                ⚠️ 달력을 쓰지 않는다.

                   학부모가 아는 것은 "9월 22일" 이 아니라 "화·목 오후 4시 이후" 다.
                   날짜 하나를 받으면 학원은 그날만 제안할 수 있고, 그날이 안 되면
                   대화가 거기서 끝난다.
              */}
              <p className={styles.scheduleIntro}>
                언제가 괜찮으세요?
                <span className={styles.scheduleHint}>
                  가능한 요일과 시간을 알려주시면 학원에서 맞는 시간을 제안해드려요.
                </span>
              </p>

              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>가능한 요일</legend>
                <div className={styles.dayChips}>
                  {PREFERRED_DAY_OPTIONS.map((option) => {
                    const selected = days.includes(option.value)
                    return (
                      <label
                        key={option.value}
                        className={`${styles.dayChip} ${selected ? styles.dayChipSelected : ""}`}
                      >
                        <input
                          type="checkbox"
                          name="preferredDays"
                          value={option.value}
                          checked={selected}
                          onChange={() =>
                            setDays((previous) =>
                              previous.includes(option.value)
                                ? previous.filter((day) => day !== option.value)
                                : [...previous, option.value]
                            )
                          }
                          disabled={isPending}
                          className={styles.visuallyHidden}
                        />
                        <span aria-hidden="true">{option.label}</span>
                        <span className={styles.visuallyHidden}>{option.label}요일</span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>몇 시쯤 괜찮으세요?</span>
                <input
                  type="time"
                  name="preferredStartTime"
                  className={styles.input}
                  defaultValue={currentPreferredStartTime?.slice(0, 5) ?? ""}
                  step={600}
                  disabled={isPending}
                  required
                />
              </label>

              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>그 시간은</legend>
                <div className={styles.reasonList}>
                  {PREFERRED_TIME_MODE_OPTIONS.map((option) => (
                    <label key={option.value} className={styles.reasonItem}>
                      <input
                        type="radio"
                        name="preferredTimeMode"
                        value={option.value}
                        checked={timeMode === option.value}
                        onChange={() => setTimeMode(option.value)}
                        disabled={isPending}
                      />
                      <span className={styles.reasonLabel}>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {requiresPreferredEndTime(timeMode) ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>언제까지 괜찮으세요?</span>
                  <input
                    type="time"
                    name="preferredEndTime"
                    className={styles.input}
                    defaultValue={currentPreferredEndTime?.slice(0, 5) ?? ""}
                    step={600}
                    disabled={isPending}
                    required
                  />
                </label>
              ) : null}
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
