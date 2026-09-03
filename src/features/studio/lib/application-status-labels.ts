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
 * 계산은 trial-completion 의 resolveTrialDisplayStatus 가 한다.
 */
export type StudioDisplayStatus = ApplicationStatus | "no_show" | "in_trial"

export const STUDIO_APPLICATION_STATUS_LABELS: Record<StudioDisplayStatus, string> = {
  new: "신규 신청",
  reviewing: "신청 확인",
  confirmed: "일정 확정",
  in_trial: "체험 중",
  completed: "체험 완료",
  canceled: "신청 취소",
  no_show: "노쇼"
}

export const STUDIO_REGISTRATION_STATUS_LABELS: Record<ApplicationRegistrationStatus, string> = {
  undecided: "등록 미결정",
  enrolled: "등록함",
  not_enrolled: "미등록",
  pending: "고민 중"
}

/**
 * 상태 배지의 공식 tone. STUDIO_DESIGN_SYSTEM.md §2.2 의 매핑을 그대로 옮긴 것이다.
 * 화면마다 다시 판단하지 않는다 — 같은 status 는 어디서 보든 같은 label + 같은 tone 이다.
 */
export type StudioStatusTone = "green" | "amber" | "blue" | "gray" | "red"

export const STUDIO_APPLICATION_STATUS_TONES: Record<StudioDisplayStatus, StudioStatusTone> = {
  new: "amber",
  reviewing: "blue",
  confirmed: "green",
  // 정상 진행이라 경고색을 쓰지 않는다. blue 는 reviewing 처럼 진행 축의 중간 상태에 이미 쓰고 있다.
  in_trial: "blue",
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
