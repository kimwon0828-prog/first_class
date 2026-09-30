import { registrationReasons } from "@/features/registration/lib/registration-input"
import type { ApplicationRegistrationStatus, ApplicationStatus } from "@/shared/lib/db/adapter"
import { resolveTrialStartAtMs, type TrialScheduleWindow } from "./trial-completion"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

// Cases-only projection: Dashboard and Application Detail keep their existing contracts.
export type CasesWorkflowInput = TrialScheduleWindow & {
  status: ApplicationStatus
  registrationStatus: ApplicationRegistrationStatus
  canceledAt: string | null
  noShowAt: string | null
  recordFinalized: boolean
  reportSent: boolean
}
export type CasesActionKey = "schedule" | "trial" | "record" | "report" | "registration"
export const CASES_ACTIONS = {
  schedule: { title: "일정 확정", description: "체험 일정을 잡아주세요.", icon: "calendar" },
  trial: { title: "체험 진행", description: "체험 수업을 진행해 주세요.", icon: "calendar" },
  record: { title: "체험 기록 작성", description: "체험 수업 내용을 기록해 주세요.", icon: "record" },
  report: { title: "리포트 발송", description: "학부모에게 리포트를 보내주세요.", icon: "report" },
  registration: { title: "등록 결과 확인", description: "등록 여부를 확인해 주세요.", icon: "registration" }
} as const
export const CASES_REGISTRATION_LABELS = { undecided: "결정 전", pending: "고민 중", enrolled: "등록 완료", not_enrolled: "미등록" } as const
export function deriveCasesWorkflow(input: CasesWorkflowInput, now = new Date()) {
  const exception = input.noShowAt ? "노쇼" : input.status === "canceled" || input.canceledAt ? "취소" : null
  let action: CasesActionKey | null = null
  let progress: string = exception ?? "신청 접수"
  let filter: "new" | "schedule_needed" | "confirmed" | "post_trial" | "enrolled" | "not_enrolled" | "canceled" | "no_show"
  if (exception) filter = exception === "노쇼" ? "no_show" : "canceled"
  else if (input.status === "completed") {
    progress = "체험 완료"
    action = !input.recordFinalized ? "record" : !input.reportSent ? "report"
      : ["undecided", "pending"].includes(input.registrationStatus) ? "registration" : null
    filter = action ? "post_trial" : input.registrationStatus === "enrolled" ? "enrolled" : "not_enrolled"
  } else if (input.status === "confirmed" && resolveTrialStartAtMs(input) !== null) {
    // Passing the scheduled end never marks an application completed.
    progress = resolveTrialStartAtMs(input)! > now.getTime() ? "체험 예정" : "일정 확정"
    action = "trial"
    filter = "confirmed"
  } else {
    action = "schedule"
    filter = input.status === "new" ? "new" : "schedule_needed"
  }
  return { progress, action, filter, closed: Boolean(exception) || (input.status === "completed" && !action),
    registration: exception ?? CASES_REGISTRATION_LABELS[input.registrationStatus] }
}
export type CasesWorkflow = ReturnType<typeof deriveCasesWorkflow>
export type CasesListItem = {
  id: string
  student: { name: string; grade: string }
  guardian: { name: string | null; phone: string | null }
  klass: { title: string | null; subject: string | null }
  assignee: { teacherName: string | null }
  registrationStatus: ApplicationRegistrationStatus
  registrationReasonIds: string[]
  workflow: CasesWorkflow
  requestedSlotAt: string
  confirmedSlotAt: string | null
  latestRecord: { at: string; label: string } | null
}
export const formatCasesDate = (value: string) => {
  const parts = getSeoulDateTimeParts(value)
  return parts ? `${parts.month}월 ${parts.day}일` : "—"
}
export function getCasesScheduleLabel(item: CasesListItem) {
  const parts = getSeoulDateTimeParts(item.confirmedSlotAt ?? item.requestedSlotAt)
  if (!parts) return null
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][parts.weekday]
  return `${parts.month}/${parts.day} (${weekday}) ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")} · ${item.confirmedSlotAt ? "확정" : "희망"}`
}

// Presentation only: never changes active/closed membership or loads private notes.
export function getCasesResultSummary(item: CasesListItem) {
  if (item.workflow.filter === "no_show") return { label: "노쇼", reasons: [], remaining: 0 }
  if (item.workflow.filter === "canceled") return { label: "취소", reasons: [], remaining: 0 }
  const reasons = registrationReasons(item.registrationStatus)
    .filter(([id]) => item.registrationReasonIds.includes(id))
    .map(([id, label]) => ({ id, label }))
  return {
    label: ["not_enrolled", "pending"].includes(item.registrationStatus) ? "사유 미입력" : CASES_REGISTRATION_LABELS[item.registrationStatus],
    reasons: reasons.slice(0, 2),
    remaining: Math.max(0, reasons.length - 2)
  }
}
