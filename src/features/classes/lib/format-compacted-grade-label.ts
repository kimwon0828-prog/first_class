import { LEARNER_GRADES, getChildGradeLabel } from "@/shared/constants/education-taxonomy"

const GRADE_LABEL_ORDER = new Map<string, number>(LEARNER_GRADES.map((item, index) => [item.label, index]))

const normalizeText = (value: string | null | undefined) => (value ?? "").trim()

const toDisplayGradeLabel = (value: string) => {
  const normalized = getChildGradeLabel(value) ?? normalizeText(value)
  return GRADE_LABEL_ORDER.has(normalized) ? normalized : null
}

export const formatCompactedGradeLabel = (value: string | null | undefined) => {
  const normalized = normalizeText(value)
  if (!normalized || normalized.includes("~")) {
    return normalized
  }

  const tokens = normalized
    .split(/[·,]/)
    .map((item) => normalizeText(item))
    .filter(Boolean)

  if (tokens.length === 0) {
    return normalized
  }

  const resolvedLabels = tokens.map(toDisplayGradeLabel)
  if (resolvedLabels.some((item) => item === null)) {
    return normalized
  }

  const uniqueLabels = Array.from(new Set(resolvedLabels)) as string[]
  if (uniqueLabels.length <= 1) {
    return uniqueLabels[0] ?? normalized
  }

  const orderedLabels = [...uniqueLabels].sort((left, right) => {
    return (GRADE_LABEL_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER) - (GRADE_LABEL_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER)
  })

  const orderedIndexes = orderedLabels.map((item) => GRADE_LABEL_ORDER.get(item) ?? -1)
  const isContiguous = orderedIndexes.every((item, index) => {
    if (index === 0) {
      return item >= 0
    }
    return item === orderedIndexes[index - 1] + 1
  })

  return isContiguous
    ? `${orderedLabels[0]}~${orderedLabels[orderedLabels.length - 1]}`
    : orderedLabels.join(" · ")
}
