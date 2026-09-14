/**
 * 실제로 등록이 어떻게 결정되었는가.
 *
 * ⚠️ ParentDecision 이 아니다.
 *
 * parent_decisions 는 학부모 본인이 남긴 "지금 생각" 이고(planned · considering ·
 * declined), 이건 학원에서 확정된 실제 결과다. 주체도 의미도 다르다.
 * 그래서 값이 겹치지 않는다 — 둘을 서로 변환하지 않는다.
 *
 * ParentDecision 이 planned 인데 RegistrationResult 가 not_enrolled 인 것은
 * 오류가 아니다. 그 어긋남 자체가 남겨 둘 사실이다.
 */
export type RegistrationResult = "enrolled" | "not_enrolled"

/**
 * 이 기록이 어디에서 왔는가.
 *
 *   studio                     — Studio 등록 상담에서 그때 확정된 것
 *   legacy_registration_status — registration_status 에서 한 번 옮겨 온 것
 */
export type RegistrationResultOrigin = "studio" | "legacy_registration_status"

export const REGISTRATION_RESULT_VALUES: ReadonlySet<string> = new Set<RegistrationResult>([
  "enrolled",
  "not_enrolled"
])

export const isRegistrationResult = (value: unknown): value is RegistrationResult =>
  typeof value === "string" && REGISTRATION_RESULT_VALUES.has(value)

export const isRegistrationResultOrigin = (value: unknown): value is RegistrationResultOrigin =>
  value === "studio" || value === "legacy_registration_status"

const REGISTRATION_RESULT_LABELS: Record<RegistrationResult, string> = {
  enrolled: "등록",
  not_enrolled: "미등록"
}

export const getRegistrationResultLabel = (value: RegistrationResult): string =>
  REGISTRATION_RESULT_LABELS[value]

/**
 * 결과가 확정되지 않은 legacy 상태.
 *
 * pending · undecided 는 RegistrationResult 값이 아니다. "아직 결과가 없음" 이고,
 * 그 상태는 현재 RegistrationResult 가 존재하지 않는 것으로 표현한다 —
 * 없음을 값으로 적지 않는다.
 */
export const isUnresolvedRegistrationStatus = (
  registrationStatus: string | null | undefined
): boolean => !isRegistrationResult(registrationStatus)

/** 학원 화면이 받는 현재 결과. raw row 를 그대로 넘기지 않는다. */
export type RegistrationResultSummary = {
  result: RegistrationResult
  origin: RegistrationResultOrigin
  /** 결과가 실제로 확정된 시각. 신뢰할 수 있는 기록이 없으면 null 이다. */
  resolvedAt: string | null
  /** 이 기록이 만들어진 시각. resolvedAt 과 다른 사실이다. */
  createdAt: string
}
