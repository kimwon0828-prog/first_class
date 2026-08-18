import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  StudioTrialResultNextAction,
  StudioTrialResultParentReaction
} from "@/shared/lib/db/adapter"

export const TRIAL_RESULT_OBSERVATION_OPTIONS = [
  "집중을 잘했어요",
  "적극적으로 참여했어요",
  "발표를 잘했어요",
  "이해가 빨랐어요",
  "도움이 조금 필요했어요",
  "난이도가 높아 보였어요",
  "난이도가 쉬워 보였어요"
] as const

export const TRIAL_RESULT_PARENT_REACTION_OPTIONS: Array<{
  value: StudioTrialResultParentReaction
  label: string
}> = [
  { value: "positive", label: "긍정" },
  { value: "considering", label: "고민 중" },
  { value: "negative", label: "부정" }
]

export const TRIAL_RESULT_NEXT_ACTION_OPTIONS: Array<{
  value: StudioTrialResultNextAction
  label: string
}> = [
  { value: "consultation", label: "상담하기" },
  { value: "follow_up", label: "다시 연락하기" },
  { value: "registration_discussion", label: "등록 논의" },
  { value: "undecided", label: "아직 미정" }
]

export const getTrialResultParentReactionLabel = (value: StudioTrialResultParentReaction | null) => {
  if (!value) {
    return null
  }

  return TRIAL_RESULT_PARENT_REACTION_OPTIONS.find((item) => item.value === value)?.label ?? null
}

export const getTrialResultNextActionLabel = (value: StudioTrialResultNextAction | null) => {
  if (!value) {
    return null
  }

  return TRIAL_RESULT_NEXT_ACTION_OPTIONS.find((item) => item.value === value)?.label ?? null
}

export const TRIAL_RESULT_REGISTRATION_OPTIONS: Array<{
  value: ApplicationRegistrationStatus
  label: string
  description: string
}> = [
  { value: "enrolled", label: "등록함", description: "정규 수강으로 이어졌어요." },
  { value: "pending", label: "고민 중", description: "추가 상담이나 재연락이 필요해요." },
  { value: "not_enrolled", label: "미등록", description: "등록하지 않기로 결정했어요." },
  { value: "undecided", label: "아직 결정 안 됨", description: "결정을 아직 보류하고 있어요." }
]

export const TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS: Array<{
  value: ApplicationUnregisteredReason
  label: string
}> = [
  { value: "schedule_mismatch", label: "일정 불일치" },
  { value: "cost_burden", label: "비용 부담" },
  { value: "distance", label: "거리" },
  { value: "child_reaction", label: "아이 반응" },
  { value: "comparing_other_academies", label: "다른 학원 비교 중" },
  { value: "no_response", label: "연락 두절" },
  { value: "class_level_mismatch", label: "수업/레벨 불일치" },
  { value: "other", label: "기타" }
]

export const getTrialResultRegistrationLabel = (value: ApplicationRegistrationStatus | null | undefined) => {
  if (!value) {
    return null
  }

  return TRIAL_RESULT_REGISTRATION_OPTIONS.find((item) => item.value === value)?.label ?? null
}

export const getTrialResultUnregisteredReasonLabel = (
  value: ApplicationUnregisteredReason | null | undefined
) => {
  if (!value) {
    return null
  }

  return TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS.find((item) => item.value === value)?.label ?? null
}
