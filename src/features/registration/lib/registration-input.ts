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
