import type {
  ApplicationRegistrationStatus,
  ApplicationStatus,
  StudioApplicationDetail,
  StudioApplicationSummary
} from "@/shared/lib/db/adapter"

export type StudioDisplayStatus = ApplicationStatus | "no_show"

export const STUDIO_APPLICATION_STATUS_LABELS: Record<StudioDisplayStatus, string> = {
  new: "신규 신청",
  reviewing: "상담 대기",
  confirmed: "수업 확정",
  completed: "체험 완료",
  canceled: "신청 취소",
  no_show: "노쇼"
}

export const STUDIO_REGISTRATION_STATUS_LABELS: Record<ApplicationRegistrationStatus, string> = {
  undecided: "등록 미결정",
  enrolled: "등록함",
  not_enrolled: "미등록",
  pending: "보류"
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

export const getStudioRegistrationStatusLabel = (registrationStatus: ApplicationRegistrationStatus) =>
  STUDIO_REGISTRATION_STATUS_LABELS[registrationStatus]

export const isRegistrationDecisionRecorded = (item: Pick<
  StudioApplicationDetail,
  "registrationStatus"
>) => item.registrationStatus !== "undecided"
