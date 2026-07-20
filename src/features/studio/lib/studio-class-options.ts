import { GRADE_OPTIONS } from "@/shared/constants/grade-options"

export const studioClassSubjectOptions = [
  "사고력수학",
  "교과수학",
  "국어/독서논술",
  "영어",
  "과학",
  "코딩/로봇",
  "미술",
  "음악",
  "체육/무용",
  "기타"
] as const

export type StudioClassSubjectOption = (typeof studioClassSubjectOptions)[number]

const legacyStudioClassSubjectMap: Record<string, StudioClassSubjectOption> = {
  국어: "국어/독서논술",
  독서논술: "국어/독서논술",
  수학: "교과수학",
  코딩: "코딩/로봇",
  코딩로봇: "코딩/로봇",
  로봇: "코딩/로봇",
  체육: "체육/무용",
  무용: "체육/무용",
  체육무용: "체육/무용",
  기타과목: "기타"
}

export const normalizeStudioClassSubjectOption = (
  value: string | null | undefined
): StudioClassSubjectOption | null => {
  const normalized = value?.trim()
  if (!normalized) {
    return null
  }

  if (studioClassSubjectOptions.includes(normalized as StudioClassSubjectOption)) {
    return normalized as StudioClassSubjectOption
  }

  return legacyStudioClassSubjectMap[normalized] ?? null
}

export const studioClassProgramTypeOptions = [
  {
    value: "trial_class",
    label: "체험수업"
  },
  {
    value: "level_test",
    label: "레벨테스트"
  }
] as const

export type StudioClassProgramTypeOption =
  (typeof studioClassProgramTypeOptions)[number]["value"]

export const studioClassGradeOptions = GRADE_OPTIONS

export type StudioClassGradeOption = (typeof studioClassGradeOptions)[number]
