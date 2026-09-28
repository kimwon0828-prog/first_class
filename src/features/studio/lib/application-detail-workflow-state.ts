import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"
import type { ParentDecision } from "@/features/decisions/lib/parent-decision"
import { getParentDecisionLabel } from "@/features/decisions/lib/parent-decision"
import type { RegistrationResult } from "@/features/registration/lib/registration-result"
import { formatSeoulDateTime } from "./seoul-datetime"
import { getTrialProgressState } from "./trial-completion"
import { formatSeoulDateKey } from "@/shared/lib/seoul-datetime"

/** Read-only evidence from the existing queries. Unknown is never equivalent to absent. */
export type ApplicationWorkflowEvidence = {
  trialResultError?: string | null
  report: {
    error: string | null
    version: number | null
    publishedAt: string | null
    changed: boolean
    canPublish: boolean
  }
  parentDecision: { error: string | null; value: ParentDecision | null; createdAt: string | null }
  registration: { error: string | null; result: RegistrationResult | null; resolvedAt: string | null }
}
export type WorkflowStepId = "trial" | "record" | "parent" | "registration"
export type WorkflowAction = "assignee" | "status" | "record" | "report" | "consultation" | "registration"
export type WorkflowStep = {
  id: WorkflowStepId
  title: string
  state: "done" | "current" | "waiting" | "available" | "restricted" | "error"
  summary: string
}
export type ApplicationDetailWorkflowState = {
  closed: boolean
  result: RegistrationResult | null
  title: string
  description: string
  primary: { action: WorkflowAction; label: string; step: WorkflowStepId } | null
  currentStep: WorkflowStepId | null
  steps: WorkflowStep[]
}

export const hasTrialRecordContent = (record: StudioApplicationDetail["trialResult"]) => Boolean(
  record && (record.observations.length || record.recommendedCourse?.trim() ||
    record.recommendedLevel?.trim() || record.recommendedSchedule?.trim() ||
    record.publicSummary?.trim() || record.note?.trim())
)

/** Presentation only: no persisted workflow status, time never completes an application. */
export function deriveApplicationDetailWorkflow({ application: a, evidence: e, nowIso,
  canWriteTrialResults, canWriteConsultations
}: {
  application: StudioApplicationDetail
  evidence: ApplicationWorkflowEvidence
  nowIso: string
  canWriteTrialResults: boolean
  canWriteConsultations: boolean
}): ApplicationDetailWorkflowState {
  const completed = a.status === "completed"
  const result = e.registration.error ? null : e.registration.result ??
    (completed && (a.registrationStatus === "enrolled" || a.registrationStatus === "not_enrolled") ? a.registrationStatus : null)
  const closed = a.status === "canceled" || Boolean(result)
  const hasRecord = hasTrialRecordContent(a.trialResult)
  const progress = getTrialProgressState(a, new Date(nowIso))
  const inTrial = a.status === "confirmed" && (progress === "in_trial" || progress === "after_scheduled_end")
  const today = formatSeoulDateKey(nowIso)
  const contactDay = a.nextContactAt ? formatSeoulDateKey(a.nextContactAt) : null
  const contactDue = Boolean(contactDay && today && contactDay <= today)
  const contactFuture = Boolean(contactDay && today && contactDay > today)
  let title = "진행 상황을 확인해 주세요."
  let description = "리포트와 학부모 응답 여부에 관계없이 실제 등록 결과를 기록할 수 있어요."
  let primary: ApplicationDetailWorkflowState["primary"] = null
  const act = (action: WorkflowAction, label: string, step: WorkflowStepId, message: string) => {
    primary = { action, label, step }
    title = message
  }

  // Terminal results precede missing records. No large task CTA on closed cases.
  if (closed) {
    title = a.status === "canceled" ? (a.noShowAt ? "노쇼로 종료되었습니다." : "취소된 신청입니다.") :
      result === "enrolled" ? "등록이 완료되었습니다." : "미등록으로 종료되었습니다."
    description = "기존 기록과 이력을 확인할 수 있어요."
  } else if (!completed) {
    if (a.status === "new" || a.status === "reviewing") act("status", "일정 확정하기", "trial", "체험 일정을 확인하고 확정해 주세요.")
    else if (inTrial) act("status", "체험 완료", "trial", "체험이 끝났다면 완료 처리해 주세요.")
    else title = progress === "unknown" ? "확정된 체험 시간을 확인해 주세요." : "확정된 체험 일정이 예정되어 있어요."
    description = "체험 완료 후 기록과 등록 결과를 관리할 수 있어요."
  } else if (e.registration.error || e.trialResultError) {
    title = "정보를 불러오지 못했어요."
    description = "진행 상태를 다시 확인한 뒤 작업해 주세요."
  } else if (!hasRecord) {
    title = "체험 기록을 작성해 주세요."
    description = "관찰 내용과 추천 사항을 한 번 기록하고, 공개 가능한 내용으로 학부모 리포트를 발행해요."
    if (canWriteTrialResults) act("record", "체험 기록 작성", "record", title)
  } else if (contactDue && canWriteConsultations) {
    act("consultation", "상담 기록", "registration", contactDay === today ? "오늘 연락할 예정이에요." : "연락 예정일이 지났어요.")
    description = "연락 후 상담 내용과 실제 등록 결과를 남겨 주세요."
  } else if (e.report.error || e.parentDecision.error) {
    title = "정보를 불러오지 못했어요."
    description = "리포트 또는 학부모 응답을 다시 확인해 주세요. 다른 기록은 계속 확인할 수 있어요."
  } else if (e.report.canPublish && (!e.report.version || e.report.changed)) {
    act("report", "리포트 확인·발행", "record", e.report.version ? "수정한 기록을 확인하고 새 버전을 발행해 주세요." : "체험 기록을 학부모에게 발행해 주세요.")
    description = "내부 메모를 제외한 공개 가능한 내용만 리포트에 포함됩니다."
  } else if ((e.parentDecision.value === "planned" || e.parentDecision.value === "declined") && canWriteConsultations) {
    act("registration", "등록 결과 입력", "registration", "학원에서 확인한 실제 등록 결과를 기록해 주세요.")
  } else if (contactFuture) {
    title = "다음 연락이 예정되어 있어요."
  } else if (e.parentDecision.value === "considering" && canWriteConsultations) {
    act("consultation", "상담 기록", "parent", "학부모가 고민 중이에요. 후속 상담을 남겨 주세요.")
  } else if (e.report.version && !e.parentDecision.value && a.parentId) {
    title = "학부모 응답을 기다리고 있어요."
  } else if (canWriteConsultations) {
    act("registration", "등록 결과 입력", "registration", "확인한 등록 결과가 있다면 기록해 주세요.")
  }

  const steps: WorkflowStep[] = [
    { id: "trial", title: "체험 완료", state: completed ? "done" : closed ? "restricted" : "waiting",
      summary: completed ? formatSeoulDateTime(a.completedAt) ?? "체험 완료" : a.status === "canceled" ? (a.noShowAt ? "노쇼" : "취소") : inTrial ? "체험 진행 중" : "체험 전" },
    { id: "record", title: "체험 기록 · 리포트", state: e.trialResultError || e.report.error ? "error" : !completed ? "restricted" : e.report.version && !e.report.changed ? "done" : e.report.canPublish || !hasRecord ? "available" : "restricted",
      summary: e.trialResultError || e.report.error ? "정보를 불러오지 못했어요." : !completed ? "체험 완료 후 작성 가능" : e.report.version ? `리포트 발행 완료 · v${e.report.version}${e.report.changed ? " · 기록 수정됨" : ""}` : hasRecord ? "기록 완료 · 미발행" : "체험 기록 미작성" },
    { id: "parent", title: "학부모 응답", state: e.parentDecision.error ? "error" : e.parentDecision.value ? "done" : !a.parentId ? "restricted" : "waiting",
      summary: e.parentDecision.error ? "정보를 불러오지 못했어요." : e.parentDecision.value ? getParentDecisionLabel(e.parentDecision.value) : !a.parentId ? "학부모 계정 미연결" : closed ? "남겨진 학부모 응답 없음" : "학부모 응답 대기" },
    { id: "registration", title: "등록 결과", state: e.registration.error ? "error" : result ? "done" : completed ? "available" : "restricted",
      summary: e.registration.error ? "정보를 불러오지 못했어요." : result === "enrolled" ? "등록 완료" : result === "not_enrolled" ? "미등록" : completed ? "아직 기록되지 않았어요." : "체험 완료 후 기록 가능" }
  ]
  const selected = primary as ApplicationDetailWorkflowState["primary"]
  if (selected) {
    const step = steps.find(item => item.id === selected.step)
    if (step && step.state !== "error") step.state = "current"
  }
  return { closed, result, title, description, primary: selected, currentStep: selected?.step ?? (closed ? null : steps.find(step => step.state === "error")?.id ?? null), steps }
}

/** Before trial completion the public journey has five steps; DB status is unchanged. */
export function getApplicationJourney(a: StudioApplicationDetail, now: Date) {
  const progress = getTrialProgressState(a, now)
  const closed = a.status === "canceled"
  const confirmed = a.status === "confirmed" || a.status === "completed"
  const started = confirmed && (a.status === "completed" || progress === "in_trial" || progress === "after_scheduled_end")
  const ended = a.status === "completed" || progress === "after_scheduled_end"
  const current = closed ? -1 : !confirmed ? 1 : !ended ? 2 : a.status === "completed" ? 4 : 3
  const titles = ["신청 접수", "일정 확정", "체험 진행", "체험 완료", "등록 결과"]
  return titles.map((title, index) => ({
    id: String(index), title,
    state: index === 0 || (index === 1 && confirmed) || (index === 2 && ended) || (index === 3 && a.status === "completed") ? "done" as const : current === index ? "current" as const : "waiting" as const,
    summary: index === 0 ? formatSeoulDateTime(a.createdAt) ?? "접수 완료"
      : closed && index === 3 ? a.noShowAt ? "노쇼" : "신청 취소"
      : index === 1 && !confirmed && !closed ? "체험 일정을 확정해 주세요."
      : index === 2 && confirmed && !closed ? ended ? "예정 시간 경과" : started ? "체험 진행 중" : "체험 예정"
      : index === 3 && started && !closed ? a.status === "completed" ? "체험 완료" : "완료 또는 노쇼 처리" : ""
  }))
}
