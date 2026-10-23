import type {
  ApplicationRegistrationStatus,
  ApplicationStatus,
  StudioApplicationDetail,
  StudioApplicationSummary
} from "@/shared/lib/db/adapter"

/**
 * 배지에 쓰는 표시 상태.
 *
 * "in_trial" 은 DB enum 이 아니다 — confirmed + 시작 시각 도달에서 파생되는 화면 전용 상태다.
 * "completion_needed" 도 화면 전용이다 — confirmed + 예정 종료 시각이 지났는데 아직 완료 처리 전.
 *   시간은 완료를 만들지 않으므로 DB 는 그대로 confirmed 이고, 학원에 "완료 확인" 을 알리는 표시일 뿐이다.
 * 계산은 trial-completion 의 resolveTrialDisplayStatus 가 한다.
 */
export type StudioDisplayStatus = ApplicationStatus | "no_show" | "in_trial" | "completion_needed"

export const STUDIO_APPLICATION_STATUS_LABELS: Record<StudioDisplayStatus, string> = {
  new: "신규 신청",
  reviewing: "신규 신청",
  confirmed: "체험 예정",
  in_trial: "체험 진행 중",
  completion_needed: "완료 확인 필요",
  completed: "체험 완료",
  canceled: "취소",
  no_show: "불참"
}

export const STUDIO_REGISTRATION_STATUS_LABELS: Record<ApplicationRegistrationStatus, string> = {
  undecided: "등록 여부 미정",
  enrolled: "등록 완료",
  not_enrolled: "등록하지 않음",
  pending: "고민중"
}

/**
 * 상태 배지의 공식 tone. STUDIO_DESIGN_SYSTEM.md §2.2 의 매핑을 그대로 옮긴 것이다.
 * 화면마다 다시 판단하지 않는다 — 같은 status 는 어디서 보든 같은 label + 같은 tone 이다.
 */
export type StudioStatusTone = "green" | "amber" | "blue" | "gray" | "red"

export const STUDIO_APPLICATION_STATUS_TONES: Record<StudioDisplayStatus, StudioStatusTone> = {
  new: "amber",
  reviewing: "amber",
  confirmed: "green",
  // 정상 진행이라 경고색을 쓰지 않는다. blue 는 reviewing 처럼 진행 축의 중간 상태에 이미 쓰고 있다.
  in_trial: "blue",
  // 학원이 처리할 일이 남은 상태라 신규 신청과 같은 amber.
  completion_needed: "amber",
  completed: "gray",
  canceled: "red",
  no_show: "red"
}

export const STUDIO_REGISTRATION_STATUS_TONES: Record<ApplicationRegistrationStatus, StudioStatusTone> = {
  undecided: "blue",
  // undecided 와 함께 "결정 대기" 로 묶인다. 같은 개념이라 같은 tone 을 쓴다.
  pending: "blue",
  enrolled: "green",
  not_enrolled: "gray"
}

export const getStudioDisplayStatus = (
  application: Pick<StudioApplicationSummary, "status" | "noShowAt">
): StudioDisplayStatus => {
  if (application.status === "canceled" && application.noShowAt) {
    return "no_show"
  }

  return application.status
}

export const getStudioStatusLabel = (
  application: Pick<StudioApplicationSummary, "status" | "noShowAt">
) => STUDIO_APPLICATION_STATUS_LABELS[getStudioDisplayStatus(application)]

export const getStudioRegistrationStatusLabel = (
  registrationStatus: ApplicationRegistrationStatus | null | undefined
) => STUDIO_REGISTRATION_STATUS_LABELS[registrationStatus ?? "undecided"]

export const getStudioStatusTone = (
  application: Pick<StudioApplicationSummary, "status" | "noShowAt">
) => STUDIO_APPLICATION_STATUS_TONES[getStudioDisplayStatus(application)]

export const getStudioRegistrationStatusTone = (
  registrationStatus: ApplicationRegistrationStatus | null | undefined
) => STUDIO_REGISTRATION_STATUS_TONES[registrationStatus ?? "undecided"]

export const isRegistrationDecisionRecorded = (item: Pick<
  StudioApplicationDetail,
  "registrationStatus"
>) => item.registrationStatus !== "undecided"
