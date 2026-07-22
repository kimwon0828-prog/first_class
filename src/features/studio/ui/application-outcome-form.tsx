"use client"

import type { ReactNode } from "react"
import { useActionState } from "react"

import {
  updateApplicationOutcomeAction,
  type UpdateApplicationOutcomeActionState
} from "@/features/studio/actions/update-application-outcome"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"

import styles from "./application-outcome-form.module.css"

const initialState: UpdateApplicationOutcomeActionState = {
  status: "idle",
  message: ""
}

type ApplicationOutcomeFormProps = {
  item: StudioApplicationDetail
  formId?: string
}

export const ApplicationOutcomeForm = ({ item, formId = "application-outcome-form" }: ApplicationOutcomeFormProps) => {
  const action = updateApplicationOutcomeAction.bind(null, item.id)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const isCompleted = item.status === "completed"

  return (
    <section className={styles.card} aria-label="상담 메모 및 등록 전환">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>상담 메모</h2>
          <p className={styles.description}>
            통화 내용과 후속 메모는 지금 저장할 수 있고, 등록 결과는 체험 완료 후 저장됩니다.
          </p>
        </div>
        <span className={styles.tip}>
          {isCompleted
            ? "등록 결과까지 저장할 수 있어요."
            : "상담 기록은 언제든 저장할 수 있어요."}
        </span>
      </header>

      <form id={formId} action={formAction} className={styles.form}>
        {state.message ? (
          <div className={`${styles.message} ${state.status === "error" ? styles.messageError : ""}`}>
            {state.message}
          </div>
        ) : null}

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>상담 메모</h3>
          <textarea
            name="consultationNote"
            defaultValue={item.consultationNote ?? ""}
            rows={6}
            className={styles.textarea}
            placeholder="예: 파이썬 경험은 없지만 수학적 사고력이 좋음. 체험 후 정규반 상담 예정."
            disabled={isPending}
          />
        </div>

        <details className={styles.details}>
          <summary className={styles.detailsSummary}>추가 운영 기록(선택)</summary>
          <div className={styles.detailsBody}>
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>체험/레벨테스트 결과</h3>
              <Field label="결과 메모">
                <textarea
                  name="trialFeedback"
                  defaultValue={item.trialFeedback ?? ""}
                  rows={4}
                  className={styles.textarea}
                  placeholder="아이 반응, 결과 요약, 다음 액션 등을 기록해 주세요."
                  disabled={isPending || !isCompleted}
                />
              </Field>
            </div>

            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>추천/확정</h3>
              <div className={styles.grid2}>
                <Field label="추천 과정">
                  <input
                    name="registeredCourse"
                    defaultValue={item.registeredCourse ?? ""}
                    className={styles.input}
                    disabled={isPending || !isCompleted}
                  />
                </Field>

                <Field label="확정 레벨">
                  <input
                    name="finalLevel"
                    defaultValue={item.finalLevel ?? ""}
                    className={styles.input}
                    disabled={isPending || !isCompleted}
                  />
                </Field>
              </div>

              <Field label="확정 수업 시간">
                <input
                  name="finalSchedule"
                  defaultValue={item.finalSchedule ?? ""}
                  className={styles.input}
                  disabled={isPending || !isCompleted}
                />
              </Field>

              <Field label="후속 조치 메모">
                <textarea
                  name="followUpNote"
                  defaultValue={item.followUpNote ?? ""}
                  rows={3}
                  className={styles.textarea}
                  placeholder="다음 연락 시점, 안내 사항 등을 기록해 주세요."
                  disabled={isPending || !isCompleted}
                />
              </Field>
            </div>
          </div>
        </details>

        <button type="submit" disabled={isPending} className={styles.primaryButton}>
          {isPending ? "저장 중..." : "메모 저장"}
        </button>
      </form>
    </section>
  )
}

type FieldProps = {
  label: string
  children: ReactNode
}

const Field = ({ label, children }: FieldProps) => {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </label>
  )
}
