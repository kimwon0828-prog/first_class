import { isParentDecision, isParentDeclineReason, isPreferredDay, isPreferredTimeMode, type ParentDecision, type ParentDeclineReason, type PreferredDay, type PreferredTimeMode } from "@/features/decisions/lib/parent-decision"

export type ExperienceDecisionDraft = {
  decision: ParentDecision | null
  declineReason: ParentDeclineReason | null
  preferredDays: PreferredDay[]
  preferredStartTime: string
  preferredEndTime: string
  preferredTimeMode: PreferredTimeMode
}
export const emptyExperienceDecision = (): ExperienceDecisionDraft => ({ decision: null, declineReason: null, preferredDays: [], preferredStartTime: "", preferredEndTime: "", preferredTimeMode: "after" })
export type ExperienceSubmissionInput = {
  selectedChipIds: string[] | null
  privateNote: string | null
  decision: ExperienceDecisionDraft | null
}
const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
export function decisionDraftError(value: ExperienceDecisionDraft): string | null {
  if (!isParentDecision(value.decision)) return "현재 생각을 하나 골라 주세요."
  if (value.decision !== "declined") return null
  if (!isParentDeclineReason(value.declineReason)) return "등록하지 않는 이유를 골라 주세요."
  if (value.declineReason !== "schedule_mismatch") return null
  if (!value.preferredDays.length || value.preferredDays.some(day => !isPreferredDay(day))) return "가능한 요일을 하나 이상 골라 주세요."
  if (!validTime(value.preferredStartTime)) return "가능한 시작 시간을 입력해 주세요."
  if (!isPreferredTimeMode(value.preferredTimeMode)) return "가능한 시간 조건을 골라 주세요."
  if (value.preferredTimeMode === "range" && (!validTime(value.preferredEndTime) || value.preferredEndTime <= value.preferredStartTime)) return "끝 시각은 시작 시각보다 뒤여야 해요."
  return null
}
