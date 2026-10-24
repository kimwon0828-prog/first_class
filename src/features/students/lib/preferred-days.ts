// 학생이 원하는 요일 — 홈 "다시 연락할 학생" · 분석 "희망 시간 불일치" · 학생 상세가 이 함수 하나를 쓴다.
//
// 우선순위
//   1. 학부모가 남긴 희망 요일(parent_decisions.preferred_days, 지금 유효한 것)
//   2. 없으면 상담 기록의 정규 희망 일정(trial_applications.regular_schedule_preference, 요일을 고른 묶음만)
// 신청 당시 자유 텍스트(preferred_regular_schedule)는 요일로 바꾸지 않는다(추정이 되기 때문 — regular-schedule-preference.ts).

import { PREFERRED_DAY_OPTIONS, type PreferredDay } from "@/features/decisions/lib/parent-decision"
import { parseRegularSchedulePreference, type IsoWeekday } from "@/features/studio/lib/regular-schedule-preference"

const ISO_TO_DAY: Record<IsoWeekday, PreferredDay> = { 1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 7: "sun" }
const DAY_ORDER = PREFERRED_DAY_OPTIONS.map((option) => option.value)

export type PreferredDaysSource = "parent" | "consultation"

/** 원하는 요일(월→일 순, 중복 없음)과 출처. 둘 다 없으면 null. */
export const resolvePreferredDays = (input: {
  decisionDays?: readonly PreferredDay[] | null
  regularSchedulePreferences?: ReadonlyArray<unknown>
}): { days: PreferredDay[]; source: PreferredDaysSource } | null => {
  const ordered = (days: Iterable<PreferredDay>) => {
    const set = new Set(days)
    return DAY_ORDER.filter((day) => set.has(day))
  }
  if (input.decisionDays && input.decisionDays.length > 0) return { days: ordered(input.decisionDays), source: "parent" }
  // 여러 신청이면 앞(최근)부터 처음으로 요일이 적힌 상담 기록을 쓴다.
  for (const value of input.regularSchedulePreferences ?? []) {
    const parsed = parseRegularSchedulePreference(value ?? null)
    if (parsed.status !== "valid" || parsed.value.state !== "specified") continue
    const days = parsed.value.groups.flatMap((group) => (group.dayMode === "selected" ? group.days.map((day) => ISO_TO_DAY[day]) : []))
    if (days.length > 0) return { days: ordered(days), source: "consultation" }
  }
  return null
}

/** 가장 많은 요일(같으면 월→일 순). 아무도 요일이 없으면 null. */
export const countTopPreferredDay = (dayLists: ReadonlyArray<readonly PreferredDay[] | null | undefined>) => {
  let top: { day: PreferredDay; label: string; count: number } | null = null
  for (const option of PREFERRED_DAY_OPTIONS) {
    const count = dayLists.filter((days) => days?.includes(option.value)).length
    if (count > 0 && (!top || count > top.count)) top = { day: option.value, label: option.label, count }
  }
  return top
}

/** "토요일 · 일요일" */
export const formatPreferredDays = (days: readonly PreferredDay[]) =>
  days.map((day) => `${PREFERRED_DAY_OPTIONS.find((option) => option.value === day)?.label ?? ""}요일`).join(" · ")
