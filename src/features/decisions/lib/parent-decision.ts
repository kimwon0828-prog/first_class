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

/** 학부모/학원 화면이 받는 현재 선택. raw row 를 그대로 넘기지 않는다. */
export type ParentDecisionSummary = {
  decision: ParentDecision
  createdAt: string
}
