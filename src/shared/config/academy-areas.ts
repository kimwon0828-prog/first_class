export const academyAreaOptions = ["후곡학원가", "백마학원가", "은행사거리학원가"] as const

export type AcademyArea = (typeof academyAreaOptions)[number]
export type AcademyAreaConfig = {
  value: AcademyArea
  enabled: boolean
  statusLabel?: string
}

const academyAreaSet = new Set<string>(academyAreaOptions)

export const academyAreaConfigs: readonly AcademyAreaConfig[] = [
  { value: "후곡학원가", enabled: false, statusLabel: "준비 중" },
  { value: "백마학원가", enabled: false, statusLabel: "준비 중" },
  { value: "은행사거리학원가", enabled: true }
]

const academyAreaConfigMap = new Map<AcademyArea, AcademyAreaConfig>(
  academyAreaConfigs.map((config) => [config.value, config])
)

export const isAcademyArea = (value: string): value is AcademyArea => academyAreaSet.has(value)

export const getAcademyAreaConfig = (value: string | null | undefined) => {
  if (!value || !isAcademyArea(value)) {
    return null
  }

  return academyAreaConfigMap.get(value) ?? null
}

export const isAcademyAreaEnabled = (value: string | null | undefined) => {
  return Boolean(getAcademyAreaConfig(value)?.enabled)
}

export const getDefaultAcademyArea = (): AcademyArea => {
  return academyAreaConfigs.find((config) => config.enabled)?.value ?? academyAreaOptions[0]
}

export const normalizeAcademyArea = (value: string | null | undefined): AcademyArea => {
  if (value && isAcademyArea(value)) {
    return value
  }

  return academyAreaOptions[0]
}
