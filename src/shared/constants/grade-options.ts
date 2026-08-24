import {
  CHILD_GRADES,
  GRADE_BANDS,
  LEARNER_GRADES,
  getChildGradeLabel,
  getGradeBandFromLearnerGrade,
  getGradeBandLabel,
  normalizeChildGrade,
  normalizeGradeBand,
  normalizeLearnerGrade,
  type AnyGradeBandValue,
  type ChildGradeValue,
  type LearnerGradeValue
} from "@/shared/constants/education-taxonomy"

export const GRADE_OPTIONS = CHILD_GRADES.map((item) => item.value) as readonly ChildGradeValue[]
export const LEARNER_GRADE_OPTIONS = LEARNER_GRADES.map((item) => item.value) as readonly LearnerGradeValue[]

export type GradeOption = ChildGradeValue
export type LearnerGradeOption = LearnerGradeValue

export const GRADE_ORDER = new Map<string, number>(
  GRADE_OPTIONS.map((value, index) => [value, index])
)
export const LEARNER_GRADE_ORDER = new Map<string, number>(
  LEARNER_GRADE_OPTIONS.map((value, index) => [value, index])
)

const GRADE_BAND_ORDER = new Map<string, number>(GRADE_BANDS.map((value, index) => [value.value, index]))

const normalizeText = (value: string | null | undefined) => (value ?? "").trim()

export const normalizeGrade = (value: string | null | undefined): GradeOption | null => {
  return normalizeChildGrade(value)
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

export const sortLearnerGrades = (values: readonly LearnerGradeOption[]) => {
  return [...values].sort((left, right) => {
    return (LEARNER_GRADE_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (LEARNER_GRADE_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
  })
}

const getUniqueSortedLearnerGrades = (values: readonly string[]) => {
  const uniqueValues = Array.from(
    new Set(
      values
        .map((value) => normalizeLearnerGrade(value))
        .filter((value): value is LearnerGradeOption => value !== null)
    )
  )

  return sortLearnerGrades(uniqueValues)
}

export const expandLearnerGradeRange = (start: LearnerGradeOption, end: LearnerGradeOption) => {
  const startIndex = LEARNER_GRADE_ORDER.get(start)
  const endIndex = LEARNER_GRADE_ORDER.get(end)

  if (startIndex == null || endIndex == null || endIndex < startIndex) {
    return [] as LearnerGradeOption[]
  }

  return LEARNER_GRADE_OPTIONS.slice(startIndex, endIndex + 1)
}

const parseTargetGradeToken = (value: string): LearnerGradeOption[] | null => {
  const normalizedBand = normalizeGradeBand(value)
  if (normalizedBand) {
    return LEARNER_GRADE_OPTIONS.filter(
      (grade) => getGradeBandFromLearnerGrade(grade) === normalizedBand
    )
  }

  if (!value.includes("~")) {
    const grade = normalizeLearnerGrade(value)
    return grade ? [grade] : null
  }

  const rangeParts = value.split("~").map((item) => item.trim())
  if (rangeParts.length !== 2) {
    return null
  }

  const start = normalizeLearnerGrade(rangeParts[0])
  const end = normalizeLearnerGrade(rangeParts[1])

  if (!start || !end) {
    return null
  }

  const grades = expandLearnerGradeRange(start, end)
  return grades.length > 0 ? grades : null
}

export type TargetGradeParseResult =
  | { status: "empty"; grades: [] }
  | { status: "invalid"; grades: [] }
  | { status: "valid"; grades: LearnerGradeOption[] }

export const parseTargetGrades = (value: string | null | undefined): TargetGradeParseResult => {
  const normalized = normalizeText(value)

  if (!normalized) {
    return { status: "empty", grades: [] }
  }

  const tokens = normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return { status: "empty", grades: [] }
  }

  const expanded: LearnerGradeOption[] = []
  for (const token of tokens) {
    const grades = parseTargetGradeToken(token)
    if (!grades || grades.length === 0) {
      return { status: "invalid", grades: [] }
    }
    expanded.push(...grades)
  }

  const grades = getUniqueSortedLearnerGrades(expanded)
  return grades.length > 0
    ? { status: "valid", grades }
    : { status: "invalid", grades: [] }
}

export const parseStoredTargetGrades = (value: string | null | undefined) => {
  const result = parseTargetGrades(value)
  return result.status === "valid" ? result.grades : []
}

export const parseStoredTargetGradeBands = (value: string | null | undefined): AnyGradeBandValue[] => {
  const parsed = parseTargetGrades(value)
  if (parsed.status !== "valid") {
    return []
  }

  const resolvedBands = parsed.grades.map((grade) => getGradeBandFromLearnerGrade(grade))

  const deduped = Array.from(
    new Set(resolvedBands.filter((value): value is AnyGradeBandValue => value !== null))
  )
  return deduped.sort((left, right) => {
    const leftOrder =
      left === "preschool"
        ? -1
        : left === "high"
          ? Number.MAX_SAFE_INTEGER
          : (GRADE_BAND_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER - 1)
    const rightOrder =
      right === "preschool"
        ? -1
        : right === "high"
          ? Number.MAX_SAFE_INTEGER
          : (GRADE_BAND_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER - 1)
    return leftOrder - rightOrder
  })
}

export const serializeTargetGrades = (values: readonly string[]) => {
  return parseStoredTargetGrades(values.join(",")).join(",")
}

const formatLearnerGradeSelection = (grades: readonly LearnerGradeOption[]) => {
  const labels = grades
    .map((grade) => getChildGradeLabel(grade))
    .filter((label): label is string => Boolean(label))

  if (labels.length <= 1) {
    return labels[0] ?? ""
  }

  const firstIndex = LEARNER_GRADE_ORDER.get(grades[0])
  const isContiguous = firstIndex != null && grades.every(
    (grade, index) => LEARNER_GRADE_ORDER.get(grade) === firstIndex + index
  )

  return isContiguous ? `${labels[0]}~${labels[labels.length - 1]}` : labels.join(" · ")
}

export const formatGradeList = (values: readonly string[]) => {
  const parsedGrades = parseStoredTargetGrades(values.join(","))
  if (parsedGrades.length === 0) {
    return ""
  }

  return formatLearnerGradeSelection(parsedGrades)
}

export const formatStoredTargetGrades = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return "정보 준비 중"
  }

  const parsedGrades = parseStoredTargetGrades(normalized)
  if (parsedGrades.length > 0) {
    return formatLearnerGradeSelection(parsedGrades)
  }

  const bandLabels = parseStoredTargetGradeBands(normalized)
    .map((band) => getGradeBandLabel(band))
    .filter((label): label is string => Boolean(label))
  const hasHiddenGradeSignal = /(유아|7세|예비초|고1|고2|고3|고등|preschool|high)/i.test(normalized)

  if (hasHiddenGradeSignal && bandLabels.some((label) => label !== "유아" && label !== "고등")) {
    return normalized
  }

  if (bandLabels.length > 0) {
    return Array.from(new Set(bandLabels)).join(" · ")
  }

  return normalized
}

export const isChildEligibleForClass = (
  childGrade: string | null | undefined,
  allowedGrades: readonly string[] | string | null | undefined
) => {
  const parsedAllowedGrades =
    typeof allowedGrades === "string" || allowedGrades == null
      ? parseTargetGrades(allowedGrades)
      : parseTargetGrades(allowedGrades.join(","))

  if (parsedAllowedGrades.status !== "valid") {
    return false
  }

  const normalizedChildGrade = normalizeLearnerGrade(childGrade)
  if (!normalizedChildGrade) {
    return false
  }

  return parsedAllowedGrades.grades.includes(normalizedChildGrade)
}
