// /academies 가 지원하는 정렬은 서버 comparator 가 실제로 구분하는 두 값뿐이다.
// 추천순은 기본값이라 URL 에 값을 만들지 않고, sort query 자체를 비운다.
export const ACADEMY_SORT_OPTIONS = [
  { value: "recommended", label: "추천순" },
  { value: "name", label: "이름순" }
] as const

export type AcademySort = (typeof ACADEMY_SORT_OPTIONS)[number]["value"]

// 내 주변에서는 서버가 거리순을 먼저 적용한다. 정렬 선택이 아니라 현재 상태 표시용 label 이다.
export const ACADEMY_DISTANCE_SORT_LABEL = "거리순"

export const isAcademySort = (value: string | null | undefined): value is AcademySort =>
  ACADEMY_SORT_OPTIONS.some((option) => option.value === value)

// URL 의 sort 를 정렬 선택으로 해석한다.
// 값이 없으면 기본(추천순)이고, 해석되지 않으면 canonical URL 에서 제거한다.
export const resolveAcademySort = (
  value: string | null | undefined
): { sort: AcademySort; shouldCanonicalize: boolean } => {
  const normalized = (value ?? "").trim()

  if (!normalized) {
    return { sort: "recommended", shouldCanonicalize: false }
  }

  if (normalized === "recommended") {
    // 기본값을 URL 에 남겨두지 않는다.
    return { sort: "recommended", shouldCanonicalize: true }
  }

  return isAcademySort(normalized)
    ? { sort: normalized, shouldCanonicalize: false }
    : { sort: "recommended", shouldCanonicalize: true }
}
