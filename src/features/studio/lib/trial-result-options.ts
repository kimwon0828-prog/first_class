import type {
  ApplicationRegistrationStatus,
  ApplicationUnregisteredReason,
  StudioTrialResultNextAction,
  StudioTrialResultParentReaction
} from "@/shared/lib/db/adapter"

/**
 * 수업 관찰 항목.
 *
 * ⚠️ 저장되는 값은 표시 문구가 아니라 code 다.
 *
 * 문구는 앞으로 바뀐다 — Report 공개, 다국어, 표현 개선. 표시 문구를 그대로
 * 저장하면 문구를 고치는 순간 과거 데이터의 의미가 끊긴다. code 는 고정이고
 * label 만 움직인다.
 *
 * 문구는 "무엇을 했는가" 로만 적는다. Observation over Judgment —
 * "집중력이 높아요" 같은 성향·능력 판단은 관찰이 아니라 진단이다.
 * 이 목록을 다시 trait label 로 축약하지 않는다.
 */
export const TRIAL_RESULT_OBSERVATION_OPTIONS = [
  {
    value: "sustained_engagement",
    label: "활동이 진행되는 동안 과제에 계속 참여했어요."
  },
  {
    value: "active_participation",
    label: "질문이나 활동 제안에 스스로 참여했어요."
  },
  {
    value: "verbal_explanation",
    label: "자기 생각이나 과정을 말로 설명했어요."
  },
  {
    value: "independent_after_instruction",
    label: "설명을 들은 뒤 다음 단계를 스스로 진행했어요."
  },
  {
    value: "needs_some_guidance",
    label: "일부 단계에서 추가 설명이나 도움이 필요했어요."
  },
  {
    value: "needs_repeated_guidance",
    label: "여러 단계에서 반복 설명이나 도움이 필요했어요."
  },
  {
    value: "ready_for_more_challenge",
    label: "안내된 활동을 마친 뒤 추가 활동을 더 시도했어요."
  }
] as const

export type TrialResultObservationCode =
  (typeof TRIAL_RESULT_OBSERVATION_OPTIONS)[number]["value"]

/** 허용 code 집합. 별도 목록을 만들지 않고 위 하나에서만 파생한다. */
export const TRIAL_RESULT_OBSERVATION_CODES: ReadonlySet<string> = new Set(
  TRIAL_RESULT_OBSERVATION_OPTIONS.map((option) => option.value)
)

/**
 * 문구를 저장하던 시절의 값 → code.
 *
 * 이 표는 "옛 값이 학부모 공개에 적합하다" 는 뜻이 아니다. 내부 source data 의
 * 의미를 code 로 보존하기 위한 것뿐이다. 기존 체험 결과는 이 작업으로
 * Report 가 되지 않는다.
 */
export const LEGACY_TRIAL_RESULT_OBSERVATION_LABELS: Readonly<
  Record<string, TrialResultObservationCode>
> = {
  "집중을 잘했어요": "sustained_engagement",
  "적극적으로 참여했어요": "active_participation",
  "발표를 잘했어요": "verbal_explanation",
  "이해가 빨랐어요": "independent_after_instruction",
  "도움이 조금 필요했어요": "needs_some_guidance",
  "난이도가 높아 보였어요": "needs_repeated_guidance",
  "난이도가 쉬워 보였어요": "ready_for_more_challenge"
}

/**
 * 저장/표시 전에 값을 code 로 정규화한다.
 *
 * 배포 순서가 어긋나 legacy 문구가 아직 남아 있어도 화면과 저장이 같은 값을
 * 보게 하려고 양쪽을 모두 받는다. 알 수 없는 값은 null 이다 —
 * 조용히 버리지 않고 호출자가 거절할 수 있게 남긴다.
 */
export const normalizeTrialResultObservation = (
  value: unknown
): TrialResultObservationCode | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (TRIAL_RESULT_OBSERVATION_CODES.has(trimmed)) {
    return trimmed as TrialResultObservationCode
  }

  return LEGACY_TRIAL_RESULT_OBSERVATION_LABELS[trimmed] ?? null
}

/** code 를 화면 문구로. 모르는 값은 null 이라 화면이 원문을 흘리지 않는다. */
export const getTrialResultObservationLabel = (value: unknown): string | null => {
  const code = normalizeTrialResultObservation(value)
  if (!code) {
    return null
  }

  return TRIAL_RESULT_OBSERVATION_OPTIONS.find((option) => option.value === code)?.label ?? null
}

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
