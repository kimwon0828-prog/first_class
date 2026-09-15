/**
 * 체험을 마친 뒤 학부모가 직접 남긴 "지금 생각".
 *
 * ⚠️ 등록 결과가 아니다.
 *
 * trial_applications.registration_status 는 학원이 판단해 적는 운영 값이고
 * (undecided · pending · enrolled · not_enrolled), 이건 학부모 본인의 의향이다.
 * 주체도 의미도 달라서 값 이름을 일부러 겹치지 않게 했다 —
 * enrolled / not_enrolled 를 여기 쓰지 않는다.
 *
 * 둘을 서로 변환하지 않는다. 학원이 "고민 중" 이라고 적어 둔 것과 학부모가
 * 스스로 "고민 중" 이라고 고른 것은 다른 사실이다.
 */
export type ParentDecision = "planned" | "considering" | "declined"

export const PARENT_DECISION_OPTIONS: ReadonlyArray<{
  value: ParentDecision
  label: string
}> = [
  { value: "planned", label: "등록할 생각이에요" },
  { value: "considering", label: "조금 더 고민 중이에요" },
  { value: "declined", label: "이번에는 등록하지 않을게요" }
]

export const PARENT_DECISION_VALUES: ReadonlySet<string> = new Set(
  PARENT_DECISION_OPTIONS.map((option) => option.value)
)

export const isParentDecision = (value: unknown): value is ParentDecision =>
  typeof value === "string" && PARENT_DECISION_VALUES.has(value)

export const getParentDecisionLabel = (value: ParentDecision): string =>
  PARENT_DECISION_OPTIONS.find((option) => option.value === value)?.label ?? value

/**
 * 지금 생각을 물어도 되는 상태인가.
 *
 * 이미 등록 여부가 확정된 신청에는 다시 묻지 않는다. 결과가 나온 뒤에
 * "등록할 생각인가요" 를 묻는 것은 무의미하고, 학부모에게는 학원이 무엇을
 * 적어 뒀는지 모르는 채 답하라는 말이 된다.
 *
 * 판정 근거는 RegistrationResult 다 — registration_status 원문이 아니다.
 * "확정된 결과가 있는가" 하나만 받는다. 무엇으로 확정됐는지(enrolled 인지
 * not_enrolled 인지)는 이 판정에 필요 없고, 학부모 화면이 알 필요도 없다.
 *
 * ⚠️ 이 판정이 ParentDecision 을 만들지 않는다. 표시 여부만 정한다.
 */
export const canCollectParentDecision = (
  hasCurrentRegistrationResult: boolean | null | undefined
): boolean => hasCurrentRegistrationResult !== true

/**
 * 등록하지 않겠다고 할 때 부모가 직접 고르는 이유.
 *
 * ⚠️ 학원이 적는 unregistered_reason 과 다른 값이다.
 *
 * 코드가 비슷해 보여도(둘 다 "일정" 이 있다) 같은 사실이 아니다. 하나는 부모가
 * 자기 입으로 말한 것이고 하나는 학원이 상담 뒤 분류한 것이다. 서로 변환하거나
 * 한쪽으로 채우지 않는다 — 그러면 누가 한 말인지 알 수 없게 된다.
 */
export type ParentDeclineReason =
  | "schedule_mismatch"
  | "price"
  | "distance"
  | "child_preference"
  | "class_mismatch"
  | "chose_another"
  | "other"

export const PARENT_DECLINE_REASON_OPTIONS: ReadonlyArray<{
  value: ParentDeclineReason
  label: string
}> = [
  { value: "schedule_mismatch", label: "시간대가 맞지 않아요" },
  { value: "price", label: "비용이 고민돼요" },
  { value: "distance", label: "위치나 거리가 부담돼요" },
  { value: "child_preference", label: "아이가 원하지 않아요" },
  { value: "class_mismatch", label: "수업이 생각과 달랐어요" },
  { value: "chose_another", label: "다른 학원을 선택했어요" },
  { value: "other", label: "기타" }
]

const PARENT_DECLINE_REASON_VALUES: ReadonlySet<string> = new Set(
  PARENT_DECLINE_REASON_OPTIONS.map((option) => option.value)
)

export const isParentDeclineReason = (value: unknown): value is ParentDeclineReason =>
  typeof value === "string" && PARENT_DECLINE_REASON_VALUES.has(value)

export const getParentDeclineReasonLabel = (value: ParentDeclineReason): string =>
  PARENT_DECLINE_REASON_OPTIONS.find((option) => option.value === value)?.label ?? value

/** 시간대가 이유일 때만 언제가 좋은지 묻는다. 그 외에는 물을 이유가 없다. */
export const requiresPreferredSchedule = (
  reason: ParentDeclineReason | null | undefined
): boolean => reason === "schedule_mismatch"

/** 학부모/학원 화면이 받는 현재 선택. raw row 를 그대로 넘기지 않는다. */
export type ParentDecisionSummary = {
  decision: ParentDecision
  createdAt: string
  /** declined 일 때만 값이 있다. */
  declineReason: ParentDeclineReason | null
  /** 시간대가 이유일 때만 값이 있다. "2026-09-22" 형태. */
  preferredDate: string | null
  preferredTimeNote: string | null
}
