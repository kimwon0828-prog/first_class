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

export type ExperienceMonthGroup = {
  /** "2026-09". key 전용이며 화면에는 label 을 쓴다. */
  key: string
  month: number
  items: ParentExperience[]
}

export type ExperienceYearGroup = {
  year: number
  months: ExperienceMonthGroup[]
}

/**
 * 연 → 월 → 경험. 최신이 위다.
 *
 * status 로 나누지 않는다. 기록의 축은 "지금 어떤 처리 단계인가" 가 아니라
 * "언제 있었던 일인가" 다.
 */
export const groupExperiencesByPeriod = (
  experiences: ParentExperience[]
): ExperienceYearGroup[] => {
  const byYear = new Map<number, Map<number, ParentExperience[]>>()

  for (const experience of experiences) {
    const date = new Date(resolveParentExperienceDate(experience))
    if (Number.isNaN(date.getTime())) {
      continue
    }

    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const months = byYear.get(year) ?? new Map<number, ParentExperience[]>()
    months.set(month, [...(months.get(month) ?? []), experience])
    byYear.set(year, months)
  }

  const sortByDateDesc = (left: ParentExperience, right: ParentExperience) =>
    new Date(resolveParentExperienceDate(right)).getTime() -
    new Date(resolveParentExperienceDate(left)).getTime()

  return [...byYear.entries()]
    .sort(([left], [right]) => right - left)
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort(([left], [right]) => right - left)
        .map(([month, items]) => ({
          key: `${year}-${String(month).padStart(2, "0")}`,
          month,
          items: [...items].sort(sortByDateDesc)
        }))
    }))
}

/**
 * 경험 종류에 맞춘 timeline 문구.
 *
 * 레벨테스트를 "체험했어요" 라고 부르지 않는다. 데이터가 구분되어 있으므로
 * 말도 구분한다. 점수·영역별 평가는 데이터가 없어 만들지 않는다.
 */
export const buildExperienceTimelineLabels = (
  programType: ClassProgramType | null
): Record<ExperienceTimelineStep["key"], string> => {
  const isLevelTest = programType === "level_test"

  return {
    applied: isLevelTest ? "레벨테스트를 신청했어요" : "체험을 신청했어요",
    confirmed: isLevelTest ? "레벨테스트 일정이 확정됐어요" : "일정이 확정됐어요",
    completed: isLevelTest ? "레벨테스트를 완료했어요" : "체험했어요",
    canceled: "신청이 취소됐어요"
  }
}
