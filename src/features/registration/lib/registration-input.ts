import type { ApplicationRegistrationStatus } from "@/shared/lib/db/adapter"

export const REGISTRATION_STATES = [
  { value: "undecided", label: "결정 전" }, { value: "pending", label: "고민 중" },
  { value: "enrolled", label: "등록 완료" }, { value: "not_enrolled", label: "미등록" }
] as const
export const PENDING_REASONS = [
  ["schedule_coordination", "시간 조율 필요"], ["price_consideration", "비용 고민"],
  ["comparing_academies", "다른 학원과 비교 중"], ["discussing_with_child", "아이와 상의 중"],
  ["discussing_with_family", "가족과 상의 중"], ["program_or_level", "과정·레벨 고민"],
  ["start_timing", "시작 시기 고민"], ["other", "기타"]
] as const
export const NOT_ENROLLED_REASONS = [
  ["schedule_mismatch", "희망 시간 불일치"], ["price_burden", "비용 부담"],
  ["distance_or_transport", "거리·이동 문제"], ["child_fit", "아이와 맞지 않음"],
  ["no_suitable_program", "원하는 과정·레벨 없음"], ["chose_other_academy", "다른 학원 선택"],
  ["schedule_changed", "개인 일정 변경"], ["no_current_enrollment_plan", "당분간 수강 계획 없음"], ["other", "기타"]
] as const
export const registrationReasons = (status: string) => status === "pending" ? PENDING_REASONS : status === "not_enrolled" ? NOT_ENROLLED_REASONS : []
export function validateRegistrationInput(status: string, reasons: string[], note: string) {
  return REGISTRATION_STATES.some(s => s.value === status) && note.length <= 2000 && reasons.length <= 9 &&
    reasons.every(r => registrationReasons(status).some(([id]) => id === r))
}
export type RegistrationInput = { applicationId: string; status: ApplicationRegistrationStatus; reasonIds: string[]; note: string | null }

// ─────────────────────────────────────────────────────────────
// 미등록 사유 — 분석 · 리포트 집계용
//
// 저장은 registration_reason_ids(복수, NOT_ENROLLED_REASONS)다. 2026-09-30 이전에 남은 옛 단일 값
// trial_applications.unregistered_reason(APPLICATION_UNREGISTERED_REASONS)은 새 분류로 옮겨 센다.
// 새 사유가 하나라도 있으면 옛 값은 보지 않는다(같은 학생을 두 번 세지 않는다).
// ─────────────────────────────────────────────────────────────

export type NotEnrolledReasonId = (typeof NOT_ENROLLED_REASONS)[number][0]

/** 옛 단일 사유 → 새 분류. 정확히 같은 뜻이 없는 것은 가장 가까운 쪽(주석)으로 옮긴다. */
export const LEGACY_UNREGISTERED_REASON_MAP: Record<string, NotEnrolledReasonId> = {
  schedule_mismatch: "schedule_mismatch", // 일정 불일치 → 희망 시간 불일치
  cost_burden: "price_burden", // 비용 부담 → 비용 부담
  distance: "distance_or_transport", // 거리 → 거리·이동 문제
  child_reaction: "child_fit", // 아이 반응 → 아이와 맞지 않음
  comparing_other_academies: "chose_other_academy", // 다른 학원 비교 중 → 다른 학원 선택(미등록으로 끝난 건이라)
  class_level_mismatch: "no_suitable_program", // 수업/레벨 불일치 → 원하는 과정·레벨 없음
  no_response: "other", // 연락 두절 → 기타(대응하는 새 사유 없음)
  other: "other" // 기타 → 기타
}

const NOT_ENROLLED_REASON_IDS = new Set<string>(NOT_ENROLLED_REASONS.map(([id]) => id))

/** 미등록 학생 한 명의 사유(새 분류). 기록이 없으면 빈 목록이다. */
export const resolveNotEnrolledReasonIds = (input: {
  registrationReasonIds?: string[] | null
  unregisteredReason?: string | null
}): NotEnrolledReasonId[] => {
  const current = (input.registrationReasonIds ?? []).filter((id): id is NotEnrolledReasonId => NOT_ENROLLED_REASON_IDS.has(id))
  if (current.length > 0) {
    return Array.from(new Set(current))
  }

  const legacy = input.unregisteredReason ? LEGACY_UNREGISTERED_REASON_MAP[input.unregisteredReason] : undefined
  return legacy ? [legacy] : []
}

export const getNotEnrolledReasonLabel = (id: string): string | null =>
  NOT_ENROLLED_REASONS.find(([value]) => value === id)?.[1] ?? null

export const NOT_ENROLLED_REASON_ORDER = new Map<string, number>(NOT_ENROLLED_REASONS.map(([id], index) => [id, index]))
