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
    <section style={cardStyle}>
      <h2 style={titleStyle}>운영 기록 및 등록 전환</h2>
      <p style={descriptionStyle}>상담, 결과, 추천 과정과 등록 전환 상태를 함께 저장합니다.</p>

      <form action={formAction} style={{ display: "grid", gap: 16 }}>
        {state.message ? (
          <p
            style={{
              margin: 0,
              color: state.status === "error" ? "#b42318" : "#1f2937",
              fontSize: 14,
              lineHeight: "20px"
            }}
          >
            {state.message}
          </p>
        ) : null}

        <Field label="상담 메모">
          <textarea
            name="consultationNote"
            defaultValue={item.consultationNote ?? ""}
            rows={4}
            style={textareaStyle}
          />
        </Field>

        <Field label="체험/레벨테스트 결과 메모">
          <textarea
            name="trialFeedback"
            defaultValue={item.trialFeedback ?? ""}
            rows={4}
            style={textareaStyle}
          />
        </Field>

        <div style={gridStyle}>
          <Field label="추천 과정">
            <input
              name="registeredCourse"
              defaultValue={item.registeredCourse ?? ""}
              style={inputStyle}
            />
          </Field>

          <Field label="확정 레벨">
            <input name="finalLevel" defaultValue={item.finalLevel ?? ""} style={inputStyle} />
          </Field>
        </div>

        <Field label="확정 수업 시간">
          <input name="finalSchedule" defaultValue={item.finalSchedule ?? ""} style={inputStyle} />
        </Field>

        <Field label="후속 조치 메모">
          <textarea
            name="followUpNote"
            defaultValue={item.followUpNote ?? ""}
            rows={3}
            style={textareaStyle}
          />
        </Field>

        <div style={gridStyle}>
          <Field label="등록 상태">
            <select
              name="registrationStatus"
              defaultValue={item.registrationStatus}
              onChange={(event) =>
                setRegistrationStatus(event.target.value as ApplicationRegistrationStatus)
              }
              style={inputStyle}
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
              disabled={registrationStatus !== "not_enrolled"}
              style={{
                ...inputStyle,
                opacity: registrationStatus === "not_enrolled" ? 1 : 0.6
              }}
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

        <button type="submit" disabled={isPending} style={buttonStyle}>
          {isPending ? "저장 중..." : "운영 기록 저장"}
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
    <label style={{ display: "grid", gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      {children}
    </label>
  )
}

const cardStyle = {
  border: "1px solid #e5e7eb",
  borderRadius: 16,
  background: "#fff",
  padding: 20
}

const titleStyle = {
  margin: "0 0 8px",
  fontSize: 18,
  lineHeight: "24px",
  color: "#111827"
}

const descriptionStyle = {
  margin: "0 0 16px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#4b5563"
}

const labelStyle = {
  fontSize: 13,
  lineHeight: "18px",
  color: "#374151"
}

const gridStyle = {
  display: "grid",
  gap: 16,
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))"
}

const inputStyle = {
  width: "100%",
  border: "1px solid #d1d5db",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  lineHeight: "20px",
  color: "#111827",
  background: "#fff"
}

const textareaStyle = {
  ...inputStyle,
  resize: "vertical" as const
}

const buttonStyle = {
  border: 0,
  borderRadius: 10,
  background: "#111827",
  color: "#fff",
  fontSize: 14,
  lineHeight: "20px",
  fontWeight: 600,
  padding: "12px 16px",
  cursor: "pointer"
}
