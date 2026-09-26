import type { ClassOperatingRule } from "./class-operating-rule"
import {
  resolveOperatingRangeEndTime,
  type CreateClassScheduleDraft
} from "./studio-operating-hours"

import { format24HourTime, weekdayLabels } from "./class-schedule-rule-utils"

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

const formatDate = (value: string) => value.replace(/-/g, ".")

const formatWeekdays = (weekdays: number[]) => {
  const unique = [...new Set(weekdays)].sort(
    (left, right) => WEEKDAY_ORDER.indexOf(left) - WEEKDAY_ORDER.indexOf(right)
  )
  return unique.map((weekday) => weekdayLabels[weekday] ?? "").filter(Boolean).join("·")
}

const formatTimes = (times: string[]) => {
  const unique = [...new Set(times)].sort()
  if (unique.length === 0) return "시간 미설정"
  if (unique.length <= 3) return unique.map(format24HourTime).join(" · ")
  return `${format24HourTime(unique[0])} 외 ${unique.length - 1}개 시간`
}

const compactWeekdayTimeSummary = (entries: Array<{ weekday: number; startTime: string }>) => {
  const timesByWeekday = new Map<number, string[]>()
  for (const entry of entries) {
    const current = timesByWeekday.get(entry.weekday) ?? []
    current.push(entry.startTime)
    timesByWeekday.set(entry.weekday, current)
  }

  if (timesByWeekday.size === 0) return "요일·시간 미설정"

  const grouped = new Map<string, number[]>()
  for (const [weekday, times] of timesByWeekday) {
    const signature = [...new Set(times)].sort().join(",")
    grouped.set(signature, [...(grouped.get(signature) ?? []), weekday])
  }

  const summaries = [...grouped.entries()].map(([signature, weekdays]) =>
    `${formatWeekdays(weekdays)} · ${formatTimes(signature.split(",").filter(Boolean))}`
  )
  if (summaries.length <= 2) return summaries.join(" / ")

  const allTimes = entries.map((entry) => entry.startTime)
  return `${formatWeekdays(entries.map((entry) => entry.weekday))} · ${formatTimes(allTimes)}`
}

export type ClassOperationPresentation = {
  title: string
  detail: string
}

export type OperatingDraftGroupPresentation = {
  id: string
  weekdayLabel: string
  timeLabel: string
}

export const presentOperatingDraftGroups = (
  draft: CreateClassScheduleDraft
): OperatingDraftGroupPresentation[] => draft.groups.map((group) => ({
  id: group.id,
  weekdayLabel: formatWeekdays(group.weekdays) || "요일 미설정",
  timeLabel: group.timeRanges
    .filter((range) => range.startTime)
    .map((range) => (draft.timeInputMode ?? "range") === "individual"
      ? format24HourTime(range.startTime)
      : `${format24HourTime(range.startTime)} ~ ${format24HourTime(
          resolveOperatingRangeEndTime(range, Number(draft.intervalMinutes)) || "--:--"
        )}`)
    .join(" / ") || "시간 미설정"
}))

export type ClassOperatingRuleReadState =
  | { status: "loaded"; rule: ClassOperatingRule | null }
  | { status: "error"; rule: null }

export const presentClassOperatingRule = (rule: ClassOperatingRule): ClassOperationPresentation => {
  if (rule.operationType === "rolling") {
    return {
      title: "상시 운영",
      detail: rule.isActive
        ? compactWeekdayTimeSummary(rule.slots)
        : "일정 생성이 중단되어 있습니다."
    }
  }

  return {
    title: "기간 지정",
    detail: rule.endDate
      ? `${formatDate(rule.startDate)} ~ ${formatDate(rule.endDate)}`
      : formatDate(rule.startDate)
  }
}

export const presentClassOperatingRuleState = (
  state: ClassOperatingRuleReadState
): ClassOperationPresentation & { kind: "configured" | "legacy" | "error" } => {
  if (state.status === "error") {
    return {
      kind: "error",
      title: "운영 정보 확인 불가",
      detail: "잠시 후 다시 확인해 주세요."
    }
  }
  if (!state.rule) {
    return {
      kind: "legacy",
      title: "운영 방식 확인 필요",
      detail: "기존 일정은 유지됩니다."
    }
  }
  return { kind: "configured", ...presentClassOperatingRule(state.rule) }
}

export const presentOperatingDraft = (
  draft: CreateClassScheduleDraft,
  selected: boolean
): ClassOperationPresentation | null => {
  if (!selected) return null

  if (!draft.isAlwaysOpen && draft.operationStartDate && draft.operationEndDate) {
    return {
      title: "기간 지정",
      detail: `${formatDate(draft.operationStartDate)} ~ ${formatDate(draft.operationEndDate)}`
    }
  }

  const groups = presentOperatingDraftGroups(draft)

  return {
    title: draft.isAlwaysOpen ? "상시 운영" : "기간 지정",
    detail: groups.length === 1
      ? `${groups[0].weekdayLabel} · ${groups[0].timeLabel}`
      : groups.length > 1 ? `운영시간 ${groups.length}개 그룹` : "요일·시간 미설정"
  }
}
