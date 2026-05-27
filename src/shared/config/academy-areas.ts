export const academyAreaOptions = ["후곡학원가", "백마학원가", "은행사거리학원가"] as const

export type AcademyArea = (typeof academyAreaOptions)[number]

const academyAreaSet = new Set<string>(academyAreaOptions)

export const isAcademyArea = (value: string): value is AcademyArea => academyAreaSet.has(value)

export const normalizeAcademyArea = (value: string | null | undefined): AcademyArea => {
  if (value && isAcademyArea(value)) {
    return value
  }

  return academyAreaOptions[0]
}
