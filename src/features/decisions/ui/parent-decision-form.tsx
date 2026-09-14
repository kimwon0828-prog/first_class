"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"

import {
  setParentDecisionAction,
  type SetParentDecisionActionState
} from "@/features/decisions/actions/set-parent-decision"
import {
  PARENT_DECISION_OPTIONS,
  type ParentDecision
} from "@/features/decisions/lib/parent-decision"

import styles from "./parent-decision-form.module.css"

type ParentDecisionFormProps = {
  experienceId: string
  /** 지금 남겨 둔 선택. 없으면 null. */
  currentDecision: ParentDecision | null
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
  loadError
}: ParentDecisionFormProps) => {
  const router = useRouter()
  const action = setParentDecisionAction.bind(null, experienceId)
  const [state, submit, isPending] = useActionState(action, initialState)
  const [pendingValue, setPendingValue] = useState<ParentDecision | null>(null)
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
          return (
            <button
              key={option.value}
              type="submit"
              name="decision"
              value={option.value}
              className={`${styles.option} ${selected ? styles.optionSelected : ""}`}
              aria-pressed={selected}
              disabled={isPending}
              onClick={() => setPendingValue(option.value)}
            >
              <span className={styles.optionMark} aria-hidden="true">
                {selected ? "●" : "○"}
              </span>
              <span className={styles.optionLabel}>{option.label}</span>
            </button>
          )
        })}
      </form>

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
