import { normalizeSubjectCategory } from "@/shared/constants/education-taxonomy"
import type { Subject, SubjectCatalogCategory } from "@/shared/lib/subject-master"

// 구 6-category URL(?subject=thinking_math 등) 을 Subject Master 로 흡수하는 표
// 이 표에 없는 구 값은 canonical URL 에서 제거된다(= 과목 필터 해제).
// /classes 와 /academies 가 같은 표를 공유한다. surface 별로 복제하지 않는다.
export const LEGACY_MASTER_FILTERS: Record<
  string,
  { categoryCode: string; subjectCode?: string }
> = {
  thinking_math: { categoryCode: "math", subjectCode: "thinking_math" },
  english: { categoryCode: "english" },
  sports_dance: { categoryCode: "sports_dance" }
}

export type SubjectQuerySelection = {
  category: SubjectCatalogCategory | null
  subject: Subject | null
  shouldCanonicalize: boolean
}

// URL 의 subjectCategory / subject 를 Subject Master 선택으로 해석한다.
// canonical 은 code 기반이며 UUID 를 URL 에 노출하지 않는다.
// 검증되지 않는 값은 예외를 던지지 않고 잘라낸 뒤 shouldCanonicalize 로 알린다.
export const resolveSubjectQuerySelection = (
  catalog: SubjectCatalogCategory[],
  input: { subjectCategory: string; subject: string }
): SubjectQuerySelection => {
  const decodedSubjectCategory = input.subjectCategory
  const decodedSubject = input.subject

  let category = catalog.find((item) => item.code === decodedSubjectCategory) ?? null
  let subject = category?.subjects.find((item) => item.code === decodedSubject) ?? null
  let shouldCanonicalize = false

  if (!decodedSubjectCategory && decodedSubject) {
    const legacySubject = normalizeSubjectCategory(decodedSubject)
    const legacyMasterFilter = legacySubject ? LEGACY_MASTER_FILTERS[legacySubject] ?? null : null
    category = legacyMasterFilter
      ? catalog.find((item) => item.code === legacyMasterFilter.categoryCode) ?? null
      : null
    subject =
      category && legacyMasterFilter?.subjectCode
        ? category.subjects.find((item) => item.code === legacyMasterFilter.subjectCode) ?? null
        : null
    shouldCanonicalize = true
  } else if (decodedSubjectCategory && !category) {
    subject = null
    shouldCanonicalize = true
  } else if (decodedSubject && !subject) {
    shouldCanonicalize = true
  }

  return { category, subject, shouldCanonicalize }
}
