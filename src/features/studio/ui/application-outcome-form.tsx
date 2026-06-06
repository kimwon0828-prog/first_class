"use client"

import type { ReactNode } from "react"
import { useActionState, useState } from "react"

import {
  updateApplicationOutcomeAction,
  type UpdateApplicationOutcomeActionState
} from "@/features/studio/actions/update-application-outcome"
import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  StudioApplicationDetail
} from "@/shared/lib/db/adapter"

import styles from "./application-outcome-form.module.css"

const initialState: UpdateApplicationOutcomeActionState = {
  status: "idle",
  message: ""
}

const REGISTRATION_STATUS_OPTIONS: Array<{
  value: ApplicationRegistrationStatus
  label: string
}> = [
  { value: "undecided", label: "미정" },
  { value: "enrolled", label: "등록완료" },
  { value: "not_enrolled", label: "미등록" },
  { value: "pending", label: "보류" }
]

const UNREGISTERED_REASON_OPTIONS: Array<{
  value: ApplicationUnregisteredReason
  label: string
}> = [
  { value: "schedule_mismatch", label: "시간 불일치" },
  { value: "cost_burden", label: "비용 부담" },
  { value: "distance", label: "거리" },
  { value: "child_reaction", label: "아이 반응" },
  { value: "comparing_other_academies", label: "타 학원 비교" },
  { value: "no_response", label: "연락두절" },
  { value: "other", label: "기타" }
]

type ApplicationOutcomeFormProps = {
  item: StudioApplicationDetail
}

export const ApplicationOutcomeForm = ({ item }: ApplicationOutcomeFormProps) => {
  const action = updateApplicationOutcomeAction.bind(null, item.id)
  const [state, formAction, isPending] = useActionState(action, initialState)
  const [registrationStatus, setRegistrationStatus] = useState<ApplicationRegistrationStatus>(
    item.registrationStatus
  )

  return (
    <section className={styles.card} aria-label="상담 메모 및 등록 전환">
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>상담 메모</h2>
          <p className={styles.description}>
            상담 내용, 학부모 요청사항, 수업 후 피드백을 기록해 주세요.
          </p>
        </div>
        <span className={styles.tip}>완료 처리된 신청만 저장할 수 있어요.</span>
      </header>

      <form action={formAction} className={styles.form}>
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

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>등록 전환</h3>
          <div className={styles.grid2}>
            <Field label="등록 상태">
              <select
                name="registrationStatus"
                defaultValue={item.registrationStatus}
                onChange={(event) =>
                  setRegistrationStatus(event.target.value as ApplicationRegistrationStatus)
                }
                className={styles.input}
                disabled={isPending}
              >
                {REGISTRATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="미등록 사유">
              <select
                name="unregisteredReason"
                defaultValue={item.unregisteredReason ?? ""}
                disabled={isPending || registrationStatus !== "not_enrolled"}
                className={`${styles.input} ${
                  registrationStatus === "not_enrolled" ? "" : styles.inputDisabledLook
                }`}
              >
                <option value="">선택 안 함</option>
                {UNREGISTERED_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
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
                  disabled={isPending}
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
                    disabled={isPending}
                  />
                </Field>

                <Field label="확정 레벨">
                  <input
                    name="finalLevel"
                    defaultValue={item.finalLevel ?? ""}
                    className={styles.input}
                    disabled={isPending}
                  />
                </Field>
              </div>

              <Field label="확정 수업 시간">
                <input
                  name="finalSchedule"
                  defaultValue={item.finalSchedule ?? ""}
                  className={styles.input}
                  disabled={isPending}
                />
              </Field>

              <Field label="후속 조치 메모">
                <textarea
                  name="followUpNote"
                  defaultValue={item.followUpNote ?? ""}
                  rows={3}
                  className={styles.textarea}
                  placeholder="다음 연락 시점, 안내 사항 등을 기록해 주세요."
                  disabled={isPending}
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
