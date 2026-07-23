import {
  GRADE_BANDS,
  normalizeSubjectCategory,
  SUBJECT_CATEGORIES,
  type GradeBandValue,
  type SubjectCategoryValue
} from "@/shared/constants/education-taxonomy"

export const studioClassSubjectOptions = SUBJECT_CATEGORIES.map((item) => item.value) as readonly SubjectCategoryValue[]

export type StudioClassSubjectOption = SubjectCategoryValue

export const normalizeStudioClassSubjectOption = (
  value: string | null | undefined
): StudioClassSubjectOption | null => {
  return normalizeSubjectCategory(value)
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

export const studioClassGradeOptions = GRADE_BANDS.map((item) => item.value) as readonly GradeBandValue[]

export type StudioClassGradeOption = GradeBandValue
