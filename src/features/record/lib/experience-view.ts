import type { ClassProgramType, ParentApplicationSummary } from "@/shared/lib/db/adapter"

// 학부모가 보는 "교육 경험" 의 파생 규칙.
//
// 새 DB status 를 만들지 않는다. 기존 trial_applications 의 status 와 timestamp 에서
// 학부모 언어로 파생하기만 한다. registration_status 는 여기에 들어오지 않는다 —
// 등록 여부는 학원의 운영 판단이고, 경험 기록이 말할 내용이 아니다.

export type ParentExperience = ParentApplicationSummary

/** 무엇을 경험했는가. classes.program_type 을 학부모 언어로 옮긴 것뿐이다. */
export const EXPERIENCE_TYPE_LABELS: Record<ClassProgramType, string> = {
  trial_class: "체험수업",
  level_test: "레벨테스트"
}

export const getExperienceTypeLabel = (programType: ClassProgramType | null): string =>
  programType ? EXPERIENCE_TYPE_LABELS[programType] : "체험"

/**
 * 경험의 진행 단계.
 *
 * completed 를 "체험 완료" 라고만 말한다. 리포트가 아직 없으므로
 * "리포트를 준비하고 있어요" 같은 약속은 하지 않는다 — 학원이 실제로
 * 작성 중이라는 근거가 어디에도 없다.
 */
export type ExperienceStage = "reviewing" | "upcoming" | "today" | "completed" | "canceled"

export const EXPERIENCE_STAGE_LABELS: Record<ExperienceStage, string> = {
  reviewing: "학원 확인 중",
  upcoming: "체험 예정",
  today: "오늘 체험",
  completed: "체험 완료",
  canceled: "취소됨"
}

const isSameLocalDay = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()

export const resolveExperienceStage = (
  experience: Pick<ParentExperience, "status" | "confirmedSlotAt">,
  now: Date = new Date()
): ExperienceStage => {
  if (experience.status === "canceled") {
    return "canceled"
  }

  if (experience.status === "completed") {
    return "completed"
  }

  if (experience.status === "confirmed") {
    const confirmedAt = experience.confirmedSlotAt ? new Date(experience.confirmedSlotAt) : null
    if (!confirmedAt || Number.isNaN(confirmedAt.getTime())) {
      return "upcoming"
    }

    // 확정된 날짜가 오늘이면 "오늘 체험" 이다. 시작 시각이 지났는지까지는 따지지 않는다 —
    // 학부모 화면에서 분 단위로 상태가 바뀌면 오히려 혼란스럽다.
    return isSameLocalDay(confirmedAt, now) ? "today" : "upcoming"
  }

  // new · reviewing
  return "reviewing"
}

/** 진행 중인가. 지난 경험과 나누는 기준은 단계 하나뿐이다. */
export const isActiveExperience = (stage: ExperienceStage): boolean =>
  stage === "reviewing" || stage === "upcoming" || stage === "today"

export type ExperienceTimelineStep = {
  key: "applied" | "confirmed" | "completed" | "canceled"
  label: string
  occurredAt: string
}

/**
 * 실제로 일어난 일만 남긴다.
 *
 * ⚠️ timestamp 가 없는 단계는 넣지 않는다. 없는 사건을 "예정" 으로 그려 넣으면
 *    기록이 아니라 추측이 된다. 그래서 미래 단계 placeholder 를 만들지 않는다.
 */
export const buildExperienceTimeline = (
  experience: Pick<ParentExperience, "createdAt" | "confirmedSlotAt" | "completedAt" | "canceledAt" | "status">
): ExperienceTimelineStep[] => {
  const steps: ExperienceTimelineStep[] = []

  if (experience.createdAt) {
    steps.push({ key: "applied", label: "체험을 신청했어요", occurredAt: experience.createdAt })
  }

  if (experience.confirmedSlotAt) {
    steps.push({ key: "confirmed", label: "일정이 확정됐어요", occurredAt: experience.confirmedSlotAt })
  }

  if (experience.completedAt) {
    steps.push({ key: "completed", label: "체험을 완료했어요", occurredAt: experience.completedAt })
  }

  if (experience.canceledAt) {
    steps.push({ key: "canceled", label: "신청이 취소됐어요", occurredAt: experience.canceledAt })
  }

  return steps.sort(
    (left, right) => new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
  )
}
