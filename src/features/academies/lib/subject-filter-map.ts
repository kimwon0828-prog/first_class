const normalizeText = (value: string | null | undefined) => (value ?? "").trim().toLowerCase()

export type AcademiesSubjectFilter = {
  queryValue: string
  label: string
  classSubjects: readonly string[]
}

export const academiesSubjectFilters = [
  {
    queryValue: "사고력수학",
    label: "사고력수학",
    classSubjects: ["사고력수학"]
  },
  {
    queryValue: "코딩로봇",
    label: "코딩로봇",
    classSubjects: ["코딩/로봇", "코딩", "로봇"]
  },
  {
    queryValue: "독서논술",
    label: "독서논술",
    classSubjects: ["국어/독서논술", "국어", "독서논술"]
  },
  {
    queryValue: "영어",
    label: "영어",
    classSubjects: ["영어"]
  },
  {
    queryValue: "예술",
    label: "예술",
    classSubjects: ["예술", "미술", "음악", "미술/음악"]
  },
  {
    queryValue: "체육무용",
    label: "체육무용",
    classSubjects: ["체육/무용", "체육", "무용"]
  }
] as const satisfies readonly AcademiesSubjectFilter[]

const studioSubjectDisplayMap: Record<string, string> = {
  사고력수학: "사고력수학",
  교과수학: "교과수학",
  수학: "교과수학",
  "코딩/로봇": "코딩/로봇",
  코딩: "코딩/로봇",
  로봇: "코딩/로봇",
  "국어/독서논술": "국어/독서논술",
  국어: "국어/독서논술",
  독서논술: "국어/독서논술",
  영어: "영어",
  과학: "과학",
  예술: "예술",
  미술: "예술",
  음악: "예술",
  "미술/음악": "예술",
  "체육/무용": "체육/무용",
  체육: "체육/무용",
  무용: "체육/무용",
  기타: "기타",
  기타과목: "기타"
}

export const resolveAcademiesSubjectFilter = (
  value: string | null | undefined
): AcademiesSubjectFilter | null => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return (
    academiesSubjectFilters.find((item) => {
      if (normalizeText(item.queryValue) === normalized || normalizeText(item.label) === normalized) {
        return true
      }

      return item.classSubjects.some((subject) => normalizeText(subject) === normalized)
    }) ?? null
  )
}

export const matchesAcademiesSubjectFilter = (
  classSubject: string | null | undefined,
  filter: AcademiesSubjectFilter | null | undefined
) => {
  const normalizedSubject = normalizeText(classSubject)
  if (!normalizedSubject) {
    return false
  }

  if (!filter) {
    return true
  }

  return filter.classSubjects.some((subject) => normalizeText(subject) === normalizedSubject)
}

export const formatAcademySubjectTag = (value: string | null | undefined) => {
  const normalized = (value ?? "").trim()
  if (!normalized) {
    return "기타"
  }

  return studioSubjectDisplayMap[normalized] ?? normalized
}
