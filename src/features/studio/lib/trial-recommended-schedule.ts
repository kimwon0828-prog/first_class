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
// Never parse/rewrite an existing finalized record or report snapshot.
export const formatTrialRecommendedSchedule = (days: readonly number[], period: TrialRecommendedPeriod | "") => {
  const dayText = TRIAL_RECOMMENDED_DAYS.filter((_, index) => days.includes(index + 1)).join("·")
  const periodText = TRIAL_RECOMMENDED_PERIODS.find(item => item.value === period)?.label ?? ""
  return [dayText, periodText].filter(Boolean).join(" / ")
}
