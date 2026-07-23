import {
  CHILD_GRADES,
  GRADE_BANDS,
  getChildGradeLabel,
  getGradeBandFromChildGrade,
  getGradeBandLabel,
  normalizeChildGrade,
  normalizeGradeBand,
  type AnyGradeBandValue,
  type ChildGradeValue,
  type GradeBandValue
} from "@/shared/constants/education-taxonomy"

export const GRADE_OPTIONS = CHILD_GRADES.map((item) => item.value) as readonly ChildGradeValue[]

export type GradeOption = ChildGradeValue

const GRADE_OPTION_SET = new Set<string>(GRADE_OPTIONS)

export const GRADE_ORDER = new Map<string, number>(
  GRADE_OPTIONS.map((value, index) => [value, index])
)

const GRADE_BAND_ORDER = new Map<string, number>(GRADE_BANDS.map((value, index) => [value.value, index]))

const normalizeText = (value: string | null | undefined) => (value ?? "").trim()

type InternalGradeValue =
  | "preschool"
  | ChildGradeValue
  | "high_1"
  | "high_2"
  | "high_3"

const INTERNAL_GRADE_AXIS = [
  "preschool",
  ...GRADE_OPTIONS,
  "high_1",
  "high_2",
  "high_3"
] as const satisfies readonly InternalGradeValue[]

const INTERNAL_GRADE_ORDER = new Map<string, number>(
  INTERNAL_GRADE_AXIS.map((value, index) => [value, index])
)

const INTERNAL_GRADE_KEY_MAP: Record<string, InternalGradeValue> = {
  preschool: "preschool",
  유아: "preschool",
  "7세": "preschool",
  예비초: "preschool",
  elem1: "elem_1",
  초1: "elem_1",
  초등1: "elem_1",
  elem2: "elem_2",
  초2: "elem_2",
  초등2: "elem_2",
  elem3: "elem_3",
  초3: "elem_3",
  초등3: "elem_3",
  elem4: "elem_4",
  초4: "elem_4",
  초등4: "elem_4",
  elem5: "elem_5",
  초5: "elem_5",
  초등5: "elem_5",
  elem6: "elem_6",
  초6: "elem_6",
  초등6: "elem_6",
  middle1: "middle_1",
  중1: "middle_1",
  middle2: "middle_2",
  중2: "middle_2",
  middle3: "middle_3",
  중3: "middle_3",
  high1: "high_1",
  고1: "high_1",
  high2: "high_2",
  고2: "high_2",
  high3: "high_3",
  고3: "high_3"
}

const toKey = (value: string | null | undefined) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[·•ㆍ&/(),._-]/g, "")
    .replace(/학년$/g, "")

const normalizeInternalGrade = (value: string | null | undefined): InternalGradeValue | null => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return null
  }

  return INTERNAL_GRADE_KEY_MAP[toKey(normalized)] ?? null
}

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

const expandInternalGradeRange = (start: InternalGradeValue, end: InternalGradeValue) => {
  const startIndex = INTERNAL_GRADE_ORDER.get(start)
  const endIndex = INTERNAL_GRADE_ORDER.get(end)

  if (startIndex == null || endIndex == null || endIndex < startIndex) {
    return [] as InternalGradeValue[]
  }

  return INTERNAL_GRADE_AXIS.slice(startIndex, endIndex + 1)
}

const toVisibleChildGrades = (values: readonly InternalGradeValue[]) =>
  values.filter((value): value is GradeOption => GRADE_OPTION_SET.has(value))

const parseRangeToken = (value: string) => {
  const normalizedBand = normalizeGradeBand(value)
  if (normalizedBand && normalizedBand !== "preschool" && normalizedBand !== "high") {
    return GRADE_OPTIONS.filter((grade) => getGradeBandFromChildGrade(grade) === normalizedBand)
  }

  const [startRaw, endRaw] = value.split("~").map((item) => item.trim())
  const start = normalizeInternalGrade(startRaw)
  const end = normalizeInternalGrade(endRaw)

  if (!start || !end) {
    return [] as GradeOption[]
  }

  return toVisibleChildGrades(expandInternalGradeRange(start, end))
}

export const parseStoredTargetGrades = (value: string | null | undefined) => {
  const normalized = normalizeText(value)

  if (!normalized) {
    return [] as GradeOption[]
  }

  const tokens = normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return [] as GradeOption[]
  }

  const expanded = tokens.flatMap((token) => {
    const normalizedBand = normalizeGradeBand(token)
    if (normalizedBand && normalizedBand !== "preschool" && normalizedBand !== "high") {
      return GRADE_OPTIONS.filter((grade) => getGradeBandFromChildGrade(grade) === normalizedBand)
    }

    if (token.includes("~")) {
      return parseRangeToken(token)
    }

    const grade = normalizeGrade(token)
    return grade ? [grade] : []
  })

  return getUniqueSortedGrades(expanded)
}

export const parseStoredTargetGradeBands = (value: string | null | undefined): AnyGradeBandValue[] => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return []
  }

  const tokens = normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (tokens.length === 0) {
    return []
  }

  const resolvedBands = tokens.flatMap((token) => {
    const directBand = normalizeGradeBand(token)
    if (directBand) {
      return [directBand]
    }

    const childGrade = normalizeGrade(token)
    if (childGrade) {
      const band = getGradeBandFromChildGrade(childGrade)
      return band ? [band] : []
    }

    return token.includes("~")
      ? Array.from(new Set(parseRangeToken(token).map((grade) => getGradeBandFromChildGrade(grade)).filter(Boolean)))
      : []
  })

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
  const normalizedBands = parseStoredTargetGradeBands(values.join(",")).filter(
    (value): value is GradeBandValue => value !== "preschool" && value !== "high"
  )

  return normalizedBands.join(",")
}

export const formatGradeList = (values: readonly string[]) => {
  if (values.length === 0) {
    return ""
  }

  const bandLabels = parseStoredTargetGradeBands(values.join(","))
    .map((value) => getGradeBandLabel(value))
    .filter((value): value is string => Boolean(value))

  return Array.from(new Set(bandLabels)).join(", ")
}

export const formatStoredTargetGrades = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized) {
    return "정보 준비 중"
  }

  const bandLabels = parseStoredTargetGradeBands(normalized)
    .map((band) => getGradeBandLabel(band))
    .filter((label): label is string => Boolean(label))
  const hasHiddenGradeSignal = /(유아|7세|예비초|고1|고2|고3|고등|preschool|high)/i.test(normalized)

  if (hasHiddenGradeSignal && bandLabels.some((label) => label !== "유아" && label !== "고등")) {
    return normalized
  }

  if (bandLabels.length > 0) {
    return Array.from(new Set(bandLabels)).join(", ")
  }

  const parsedGrades = parseStoredTargetGrades(normalized)
  if (parsedGrades.length > 0) {
    const labels = parsedGrades
      .map((grade) => getChildGradeLabel(grade))
      .filter((label): label is string => Boolean(label))
    return labels.join(", ")
  }

  return normalized
}

export const isChildEligibleForClass = (
  childGrade: string | null | undefined,
  allowedGrades: readonly string[] | string | null | undefined
) => {
  const resolvedAllowedBands =
    typeof allowedGrades === "string" || allowedGrades == null
      ? parseStoredTargetGradeBands(allowedGrades)
      : parseStoredTargetGradeBands(allowedGrades.join(","))

  if (resolvedAllowedBands.length === 0) {
    return true
  }

  const normalizedChildGrade = normalizeGrade(childGrade)
  if (!normalizedChildGrade) {
    return false
  }

  const childBand = getGradeBandFromChildGrade(normalizedChildGrade)
  return childBand ? resolvedAllowedBands.includes(childBand) : false
}
