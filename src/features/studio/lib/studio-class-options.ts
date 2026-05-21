export const studioClassSubjectOptions = [
  "국어",
  "수학",
  "영어",
  "사회",
  "과학",
  "코딩",
  "미술",
  "체육",
  "음악",
  "기타과목"
] as const

export type StudioClassSubjectOption = (typeof studioClassSubjectOptions)[number]

export const studioClassProgramTypeOptions = [
  {
    value: "trial_class",
    label: "체험수업"
  },
  {
    value: "level_test",
    label: "레벨테스트"
  }
] as const

export type StudioClassProgramTypeOption =
  (typeof studioClassProgramTypeOptions)[number]["value"]

export const studioClassGradeAgeOptions = [
  "5세",
  "6세",
  "7세",
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

export type StudioClassGradeAgeOption = (typeof studioClassGradeAgeOptions)[number]

export const studioClassGradeAgeOrder = new Map<string, number>(
  studioClassGradeAgeOptions.map((value, index) => [value, index + 1])
)

export const parseStudioClassTargetAgeRange = (value: string | null | undefined) => {
  if (!value) {
    return {
      start: studioClassGradeAgeOptions[0],
      end: studioClassGradeAgeOptions[0]
    }
  }

  const [startRaw, endRaw] = value.split("~").map((item) => item.trim())
  const start = studioClassGradeAgeOptions.includes(startRaw as StudioClassGradeAgeOption)
    ? (startRaw as StudioClassGradeAgeOption)
    : studioClassGradeAgeOptions[0]
  const endCandidate = endRaw || start
  const end = studioClassGradeAgeOptions.includes(endCandidate as StudioClassGradeAgeOption)
    ? (endCandidate as StudioClassGradeAgeOption)
    : start

  return { start, end }
}
