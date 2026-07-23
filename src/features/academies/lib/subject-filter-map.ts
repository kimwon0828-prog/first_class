import {
  getSubjectLabel,
  normalizeSubjectCategory,
  SUBJECT_CATEGORIES,
  type SubjectCategoryValue
} from "@/shared/constants/education-taxonomy"

export type AcademiesSubjectFilter = {
  queryValue: SubjectCategoryValue
  label: string
}

export const academiesSubjectFilters: readonly AcademiesSubjectFilter[] = SUBJECT_CATEGORIES.map((item) => ({
  queryValue: item.value,
  label: item.label
}))

export const resolveAcademiesSubjectFilter = (
  value: string | null | undefined
): AcademiesSubjectFilter | null => {
  const normalized = normalizeSubjectCategory(value)
  if (!normalized) {
    return null
  }

  return academiesSubjectFilters.find((item) => item.queryValue === normalized) ?? null
}

export const matchesAcademiesSubjectFilter = (
  classSubject: string | null | undefined,
  filter: AcademiesSubjectFilter | null | undefined
) => {
  const normalizedSubject = normalizeSubjectCategory(classSubject)
  if (!normalizedSubject) {
    return false
  }

  if (!filter) {
    return true
  }

  return normalizedSubject === filter.queryValue
}

export const formatAcademySubjectTag = (value: string | null | undefined) => {
  const label = getSubjectLabel(value)
  if (!label) {
    return "기타"
  }

  return label
}
