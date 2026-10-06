import { registrationReasons } from "@/features/registration/lib/registration-input"
import type { ApplicationRegistrationStatus, ApplicationStatus } from "@/shared/lib/db/adapter"
import { getTrialProgressState, resolveTrialStartAtMs, type TrialScheduleWindow } from "./trial-completion"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

// Cases-only projection: Dashboard and Application Detail keep their existing contracts.
export type CasesWorkflowInput = TrialScheduleWindow & {
  status: ApplicationStatus
  registrationStatus: ApplicationRegistrationStatus | null
  canceledAt: string | null
  noShowAt: string | null
  recordFinalized: boolean
  reportSent: boolean
}
export type CasesActionKey = "schedule" | "trial" | "record" | "report" | "registration" | "consultation" | "detail"
export const CASES_ACTIONS = {
  schedule: { title: "일정 확정", description: "체험 일정을 잡아주세요.", icon: "calendar" },
  trial: { title: "상세 보기", description: "체험 일정과 진행 상태를 확인해 주세요.", icon: "calendar" },
  record: { title: "체험 기록 작성", description: "체험 수업 내용을 기록해 주세요.", icon: "record" },
  report: { title: "리포트 확인", description: "확정한 기록의 미리보기와 발행 조건을 확인해 주세요.", icon: "report" },
  registration: { title: "등록 결과 입력", description: "등록 여부를 기록해 주세요.", icon: "registration" },
  consultation: { title: "상담 기록 추가", description: "고민 중인 학부모와 나눈 상담을 기록해 주세요.", icon: "contact" },
  detail: { title: "상세 보기", description: "신청 내용과 처리 이력을 확인해 주세요.", icon: "record" }
} as const
export const CASES_REGISTRATION_LABELS = { undecided: "결정 전", pending: "고민 중", enrolled: "등록 완료", not_enrolled: "미등록" } as const
export function deriveCasesWorkflow(input: CasesWorkflowInput, now = new Date()) {
  const exception = input.noShowAt ? "노쇼" : input.status === "canceled" || input.canceledAt ? "취소" : null
  let action: CasesActionKey | null = null
  let progress: string = exception ?? "신청 접수"
  let filter: "all" | "schedule_needed" | "confirmed" | "pending" | "enrolled" | "not_enrolled" | "canceled" | "no_show"
  if (exception) filter = exception === "노쇼" ? "no_show" : "canceled"
  else if (input.status === "completed") {
    progress = "체험 완료"
    action = !input.recordFinalized ? "record" : !input.reportSent ? "report"
      : input.registrationStatus === "pending" ? "consultation"
      : !input.registrationStatus || input.registrationStatus === "undecided" ? "registration" : null
    filter = input.registrationStatus === "pending" ? "pending" : input.registrationStatus === "enrolled" ? "enrolled"
      : input.registrationStatus === "not_enrolled" ? "not_enrolled" : "all"
  } else if (input.status === "confirmed" && resolveTrialStartAtMs(input) !== null) {
    // Passing the scheduled end never marks an application completed.
    const trialProgress = getTrialProgressState(input, now)
    progress = trialProgress === "before_start" ? "체험 예정" : trialProgress === "after_scheduled_end" ? "완료 확인 필요" : "체험 진행 중"
    action = "trial"
    filter = "confirmed"
  } else {
    action = input.status === "confirmed" ? "detail" : "schedule"
    filter = "schedule_needed"
  }
  return { progress, action, filter, closed: Boolean(exception) || input.status === "completed",
    registration: exception ?? (input.registrationStatus ? CASES_REGISTRATION_LABELS[input.registrationStatus] : "결정 전") }
}
// Navigation only: opening an existing detail section never invokes a mutation.
export const CASES_ACTION_SECTIONS: Record<CasesActionKey, string | null> = {
  schedule: "confirm-schedule", trial: null, record: "trial-record", report: "report-publishing-title",
  registration: "registration-result-title", consultation: "consultation-records", detail: null
}
export function getCasesNextActions(item: CasesListItem): CasesActionKey[] {
  const primary = item.workflow.action ?? "detail"
  if (item.workflow.closed && item.registrationStatus === "pending" && item.workflow.filter === "pending") {
    return [...new Set<CasesActionKey>([primary, "consultation", "registration"])]
  }
  return [primary]
}
export type CasesWorkflow = ReturnType<typeof deriveCasesWorkflow>
export type CasesListItem = {
  id: string
  student: { name: string; grade: string }
  guardian: { name: string | null; phone: string | null }
  klass: { title: string | null; subject: string | null }
  assignee: { teacherName: string | null }
  registrationStatus: ApplicationRegistrationStatus | null
  registrationReasonIds: string[]
  workflow: CasesWorkflow
  requestedSlotAt: string
  confirmedSlotAt: string | null
  latestRecord: { at: string; label: string } | null
  resultRecord?: { at: string | null; label: string }
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
  const reasons = registrationReasons(item.registrationStatus ?? "undecided")
    .filter(([id]) => item.registrationReasonIds.includes(id))
    .map(([id, label]) => ({ id, label }))
  return {
    label: ["not_enrolled", "pending"].includes(item.registrationStatus ?? "") ? "사유 미입력" : CASES_REGISTRATION_LABELS[item.registrationStatus ?? "undecided"],
    reasons: reasons.slice(0, 2),
    remaining: Math.max(0, reasons.length - 2)
  }
}
