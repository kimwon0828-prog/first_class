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
 * 문구를 저장하던 시절의 값.
 *
 * ⚠️ 이 목록은 canonical code 로 가는 매핑이 아니다. 매핑표였던 적이 있으나
 *    의미가 같지 않아 걷어냈다 — "난이도가 높아 보였어요" 는 관찰자의 인상이고
 *    needs_repeated_guidance 는 아이가 실제로 한 일이다. 둘은 같은 사실이 아니다.
 *    과거에 없던 행동을 지금 와서 주장하지 않는다.
 *
 * 여기에 남은 값은 오직 두 가지 용도다.
 *   1. 기존 row 를 화면에서 원문 그대로 보여 주기.
 *   2. DB 에 남아 있어도 "알 수 없는 값" 으로 취급하지 않기.
 *
 * 신규 write 에서는 받지 않는다.
 */
export const LEGACY_TRIAL_RESULT_OBSERVATION_LABELS = [
  "집중을 잘했어요",
  "적극적으로 참여했어요",
  "발표를 잘했어요",
  "이해가 빨랐어요",
  "도움이 조금 필요했어요",
  "난이도가 높아 보였어요",
  "난이도가 쉬워 보였어요"
] as const

export type LegacyTrialResultObservationLabel =
  (typeof LEGACY_TRIAL_RESULT_OBSERVATION_LABELS)[number]

/** legacy 문구 집합. 위 하나에서만 파생한다. */
export const LEGACY_TRIAL_RESULT_OBSERVATION_LABEL_SET: ReadonlySet<string> = new Set(
  LEGACY_TRIAL_RESULT_OBSERVATION_LABELS
)

/** 문구를 저장하던 시절의 값인가. 신규 입력으로는 거절하되 기존 row 는 보존한다. */
export const isLegacyTrialResultObservation = (
  value: unknown
): value is LegacyTrialResultObservationLabel =>
  typeof value === "string" && LEGACY_TRIAL_RESULT_OBSERVATION_LABEL_SET.has(value.trim())

/**
 * 신규 입력 값을 code 로 정규화한다.
 *
 * canonical code 만 통과한다. legacy 문구도, 알 수 없는 값도 null 이다 —
 * 조용히 버리거나 짐작해서 바꾸지 않고 호출자가 거절할 수 있게 남긴다.
 */
export const normalizeTrialResultObservation = (
  value: unknown
): TrialResultObservationCode | null => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return TRIAL_RESULT_OBSERVATION_CODES.has(trimmed)
    ? (trimmed as TrialResultObservationCode)
    : null
}

/** canonical code 를 화면 문구로. 모르는 값은 null 이라 화면이 원문을 흘리지 않는다. */
export const getTrialResultObservationLabel = (value: unknown): string | null => {
  const code = normalizeTrialResultObservation(value)
  if (!code) {
    return null
  }

  return TRIAL_RESULT_OBSERVATION_OPTIONS.find((option) => option.value === code)?.label ?? null
}

/**
 * 저장된 값 하나를 화면에 어떻게 보여 줄지 판정한다.
 *
 * canonical 은 현재 문구로, legacy 는 작성 당시 원문 그대로 보여 준다.
 * legacy 를 현재 문구로 바꿔 보여 주면 "같은 관찰" 이라고 주장하는 셈이다.
 */
export type TrialResultObservationDisplay =
  | { kind: "canonical"; value: TrialResultObservationCode; text: string }
  | { kind: "legacy"; value: string; text: string }

export const describeTrialResultObservation = (
  value: unknown
): TrialResultObservationDisplay | null => {
  const code = normalizeTrialResultObservation(value)
  if (code) {
    return { kind: "canonical", value: code, text: getTrialResultObservationLabel(code) ?? code }
  }

  if (isLegacyTrialResultObservation(value)) {
    const text = value.trim()
    return { kind: "legacy", value: text, text }
  }

  return null
}

/**
 * 한 배열이 한 가지 표기만 쓰는가.
 *
 * 옛 문구와 새 code 를 한 row 에 섞으면 "이 관찰은 어느 기준으로 적힌 것인가" 에
 * 답할 수 없다. Report 는 canonical 만 공개 후보로 삼기 때문에, 섞인 row 는
 * 절반만 발행되고 학부모는 그것이 일부라는 사실을 알 수 없다.
 *
 * DB CHECK 도 같은 것을 막는다. 여기 두는 이유는 DB 가 거절할 때 원장이 보는
 * 문구가 "저장 실패" 뿐이기 때문이다. 저장 전에 같은 기준으로 먼저 판단한다.
 *
 * 빈 배열은 일관된 것으로 본다.
 */
export const isConsistentObservationRepresentation = (values: readonly string[]): boolean => {
  const hasCanonical = values.some((value) => normalizeTrialResultObservation(value) !== null)
  const hasLegacy = values.some((value) => isLegacyTrialResultObservation(value))

  return !(hasCanonical && hasLegacy)
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
