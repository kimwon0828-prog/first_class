import { GRADE_OPTIONS } from "@/shared/constants/grade-options"

export const studioClassSubjectOptions = [
  "국어",
  "수학",
  "영어",
  "사회",
  "과학",
  "코딩",
  "미술",
  "체육",
  "음악",
  "기타과목"
] as const

export type StudioClassSubjectOption = (typeof studioClassSubjectOptions)[number]

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
