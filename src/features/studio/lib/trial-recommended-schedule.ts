// Teacher recommendation display text only. This is not a parent's precise schedule preference.
export const TRIAL_RECOMMENDED_DAYS = ["월", "화", "수", "목", "금", "토", "일"] as const
export const TRIAL_RECOMMENDED_PERIODS = [
  { value: "morning", label: "오전", range: "09:00~12:00" },
  { value: "afternoon", label: "오후", range: "12:00~18:00" },
  { value: "evening", label: "저녁", range: "18:00~21:00" },
  { value: "any", label: "시간 무관", range: "" }
] as const
export type TrialRecommendedPeriod = typeof TRIAL_RECOMMENDED_PERIODS[number]["value"]

// Preserve the existing optional text field: blank -> null in the unchanged server action.
// Existing free text and published snapshots are preserved; the editor parses only exact formatter output.
export const formatTrialRecommendedSchedule = (days: readonly number[], period: TrialRecommendedPeriod | "") => {
  const dayText = TRIAL_RECOMMENDED_DAYS.filter((_, index) => days.includes(index + 1)).join("·")
  const periodText = TRIAL_RECOMMENDED_PERIODS.find(item => item.value === period)?.label ?? ""
  return [dayText, periodText].filter(Boolean).join(" / ")
}

// Only parse text produced by this existing formatter. Free/legacy text stays
// unchanged until the operator explicitly selects a new recommendation.
export const parseTrialRecommendedSchedule = (value: string | null | undefined): {days:number[];period:TrialRecommendedPeriod|""} | null => {
  const text=value??"", parts=text.split(" / ")
  const dayPart=parts.find(part=>part.split("·").every(day=>(TRIAL_RECOMMENDED_DAYS as readonly string[]).includes(day)))
  const period=TRIAL_RECOMMENDED_PERIODS.find(p=>parts.includes(p.label))?.value??""
  const days=dayPart?dayPart.split("·").map(day=>TRIAL_RECOMMENDED_DAYS.indexOf(day as typeof TRIAL_RECOMMENDED_DAYS[number])+1):[]
  return formatTrialRecommendedSchedule(days,period)===text?{days,period}:null
}
