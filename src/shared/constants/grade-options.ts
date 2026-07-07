export const GRADE_OPTIONS = [
  "초1",
  "초2",
  "초3",
  "초4",
  "초5",
  "초6",
  "중1",
  "중2",
  "중3",
  "고1",
  "고2",
  "고3"
] as const

export type GradeOption = (typeof GRADE_OPTIONS)[number]

const GRADE_OPTION_SET = new Set<string>(GRADE_OPTIONS)

export const GRADE_ORDER = new Map<string, number>(
  GRADE_OPTIONS.map((value, index) => [value, index])
)

const normalizeText = (value: string | null | undefined) => value?.trim() ?? ""

export const normalizeGrade = (value: string | null | undefined): GradeOption | null => {
  const normalized = normalizeText(value)
  return GRADE_OPTION_SET.has(normalized) ? (normalized as GradeOption) : null
}

export const isValidGrade = (value: string | null | undefined): value is GradeOption => {
  return normalizeGrade(value) !== null
}

export const sortGrades = (values: readonly GradeOption[]) => {
  return [...values].sort((left, right) => {
    return (GRADE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) - (GRADE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
  })
}

export const getUniqueSortedGrades = (values: readonly string[]) => {
  const uniqueValues = Array.from(
    new Set(values.map((value) => normalizeGrade(value)).filter((value): value is GradeOption => value !== null))
  )

  return sortGrades(uniqueValues)
}

const expandGradeRange = (start: GradeOption, end: GradeOption) => {
  const startIndex = GRADE_ORDER.get(start)
  const endIndex = GRADE_ORDER.get(end)

  if (startIndex == null || endIndex == null || endIndex < startIndex) {
    return []
  }

  return GRADE_OPTIONS.slice(startIndex, endIndex + 1)
}

export const parseStoredTargetGrades = (value: string | null | undefined) => {
  const normalized = normalizeText(value)

  if (!normalized) {
    return [] as GradeOption[]
  }

  if (normalized.includes(",")) {
    const tokens = normalized
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

    if (tokens.length === 0 || tokens.some((token) => !isValidGrade(token))) {
      return [] as GradeOption[]
    }

    return getUniqueSortedGrades(tokens)
  }

  if (normalized.includes("~")) {
    const [startRaw, endRaw] = normalized.split("~").map((item) => item.trim())
    const start = normalizeGrade(startRaw)
    const end = normalizeGrade(endRaw)

    if (!start || !end) {
      return [] as GradeOption[]
    }

    return expandGradeRange(start, end)
  }

  const singleGrade = normalizeGrade(normalized)
  return singleGrade ? [singleGrade] : ([] as GradeOption[])
}

export const serializeTargetGrades = (values: readonly string[]) => {
  return getUniqueSortedGrades(values).join(",")
}

const isContiguousGradeSet = (values: readonly GradeOption[]) => {
  if (values.length <= 1) {
    return true
  }

  return values.every((grade, index) => {
    if (index === 0) {
      return true
    }

    const previous = values[index - 1]
    return (GRADE_ORDER.get(grade) ?? -1) - (GRADE_ORDER.get(previous) ?? -1) === 1
  })
}

export const formatGradeList = (values: readonly GradeOption[]) => {
  if (values.length === 0) {
    return ""
  }

  const ordered = sortGrades(values)

  if (ordered.length >= 2 && isContiguousGradeSet(ordered)) {
    return `${ordered[0]}~${ordered[ordered.length - 1]}`
  }

  return ordered.join(", ")
}

export const formatStoredTargetGrades = (value: string | null | undefined) => {
  const parsedGrades = parseStoredTargetGrades(value)
  if (parsedGrades.length > 0) {
    return formatGradeList(parsedGrades)
  }

  const fallback = normalizeText(value)
  return fallback || "정보 준비 중"
}

export const isChildEligibleForClass = (
  childGrade: string | null | undefined,
  allowedGrades: readonly string[] | string | null | undefined
) => {
  const resolvedAllowedGrades =
    typeof allowedGrades === "string" || allowedGrades == null
      ? parseStoredTargetGrades(allowedGrades)
      : getUniqueSortedGrades(allowedGrades)

  if (resolvedAllowedGrades.length === 0) {
    return true
  }

  const normalizedChildGrade = normalizeGrade(childGrade)
  if (!normalizedChildGrade) {
    return false
  }

  return resolvedAllowedGrades.includes(normalizedChildGrade)
}
