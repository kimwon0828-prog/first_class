"use client"

import { useActionState } from "react"

import {
  updateApplicationStatusAction,
  type UpdateApplicationStatusActionState
} from "@/features/studio/actions/update-application-status"
import type { ApplicationStatus } from "@/shared/lib/db/adapter"

const initialState: UpdateApplicationStatusActionState = {
  status: "idle",
  message: ""
}

const STATUS_ACTION_LABELS: Record<ApplicationStatus, string> = {
  new: "신규",
  reviewing: "검토 중으로 변경",
  confirmed: "확정으로 변경",
  completed: "완료로 변경",
  canceled: "취소"
}

type ApplicationStatusActionFormProps = {
  applicationId: string
  nextStatus: ApplicationStatus | null
}

export const ApplicationStatusActionForm = ({
  applicationId,
  nextStatus
}: ApplicationStatusActionFormProps) => {
  const action =
    nextStatus == null
      ? async (previousState: UpdateApplicationStatusActionState) => previousState
      : updateApplicationStatusAction.bind(null, applicationId, nextStatus)
  const [state, formAction, isPending] = useActionState(action, initialState)

  if (!nextStatus) {
    return (
      <section style={cardStyle}>
        <h2 style={titleStyle}>상태 액션</h2>
        <p style={descriptionStyle}>현재 상태에서는 추가 상태 변경이 필요하지 않습니다.</p>
      </section>
    )
  }

  return (
    <section style={cardStyle}>
      <h2 style={titleStyle}>상태 액션</h2>
      <p style={descriptionStyle}>허용된 다음 단계만 처리할 수 있습니다.</p>

      <form action={formAction} style={{ display: "grid", gap: 12 }}>
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

        <button type="submit" disabled={isPending} style={buttonStyle}>
          {isPending ? "처리 중..." : STATUS_ACTION_LABELS[nextStatus]}
        </button>
      </form>
    </section>
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
