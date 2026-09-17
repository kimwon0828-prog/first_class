import type { ClassProgramType, ParentApplicationSummary } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

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

const LEVEL_TEST_STAGE_LABELS: Record<ExperienceStage, string> = {
  reviewing: "학원 확인 중",
  upcoming: "레벨테스트 예정",
  today: "오늘 레벨테스트",
  completed: "레벨테스트 완료",
  canceled: "취소됨"
}

/**
 * 경험 종류에 맞춘 상태 문구.
 *
 * 레벨테스트를 "체험 완료" 라고 부르지 않는다. 데이터가 구분되어 있으므로 말도 구분한다.
 */
export const getExperienceStageLabel = (
  stage: ExperienceStage,
  programType: ClassProgramType | null
): string =>
  programType === "level_test" ? LEVEL_TEST_STAGE_LABELS[stage] : EXPERIENCE_STAGE_LABELS[stage]

/*
 * "오늘" 은 한국 기준이다.
 *
 * 실행 환경 timezone 으로 비교하면 UTC 서버에서 한국 시간 오전 일정이
 * 전날로 취급되어, 오늘 있는 체험이 "예정" 으로 보인다.
 */
const isSameSeoulDay = (left: Date, right: Date) => {
  const leftParts = getSeoulDateTimeParts(left)
  const rightParts = getSeoulDateTimeParts(right)
  if (!leftParts || !rightParts) {
    return false
  }

  return (
    leftParts.year === rightParts.year &&
    leftParts.month === rightParts.month &&
    leftParts.day === rightParts.day
  )
}

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
    return isSameSeoulDay(confirmedAt, now) ? "today" : "upcoming"
  }

  // new · reviewing
  return "reviewing"
}

/**
 * 기록 timeline 에서 이 경험을 어느 날짜에 놓을 것인가.
 *
 * "실제로 교육이 일어난(또는 일어날) 날" 을 우선한다. 신청 시각이 아니다 —
 * 8월에 신청해 9월에 체험했다면 그 경험은 9월의 기록이다.
 *
 * ⚠️ completedAt 보다 confirmedSlotAt 이 먼저다. completedAt 은 학원이 "체험 완료"
 *    버튼을 누른 시각이라 실제 수업일과 며칠 어긋날 수 있다.
 */
export const resolveParentExperienceDate = (
  experience: Pick<
    ParentExperience,
    "confirmedSlotAt" | "requestedSlotAt" | "completedAt" | "canceledAt" | "createdAt"
  >
): string => {
  const candidates = [
    experience.confirmedSlotAt,
    experience.requestedSlotAt,
    experience.completedAt,
    experience.canceledAt,
    experience.createdAt
  ]

  for (const value of candidates) {
    if (value && !Number.isNaN(new Date(value).getTime())) {
      return value
    }
  }

  return experience.createdAt
}
