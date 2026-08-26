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
  // 과목 필터가 없으면 subject 정규화 결과와 무관하게 통과시킨다.
  // 정규화 실패는 "이 수업이 어떤 카테고리인지 모른다" 일 뿐이고,
  // legacy/한글 subject 값을 가진 active class 를 목록에서 빼는 사유가 아니다.
  if (!filter) {
    return true
  }

  const normalizedSubject = normalizeSubjectCategory(classSubject)
  if (!normalizedSubject) {
    return false
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
