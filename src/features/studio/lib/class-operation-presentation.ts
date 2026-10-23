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

/* ── 수업 탭 "체험 일정" 운영 시간 요약 (Figma 2148:6104) ─────────────────── */

const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const formatMonthDay = (value: string) => `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`

/** 한 회차 길이(분). 운영 규칙은 모든 회차 길이가 같다(parseClassOperatingRule). */
export const getOperatingRuleSlotMinutes = (rule: ClassOperatingRule) => {
  const first = rule.slots[0]
  return first ? toMinutes(first.endTime) - toMinutes(first.startTime) : null
}

/** "상시 운영 (10/20부터)" · "기간 운영 (12/22–1/30)" */
export const presentOperatingRuleHeading = (rule: ClassOperatingRule) =>
  rule.operationType === "rolling"
    ? `상시 운영 (${formatMonthDay(rule.startDate)}부터)`
    : `기간 운영 (${formatMonthDay(rule.startDate)}–${rule.endDate ? formatMonthDay(rule.endDate) : ""})`

export type OperatingRuleGroupPresentation = {
  id: string
  /** "매주 화 · 목 · 금" */
  weekdayLabel: string
  /** "16:00 – 18:00 · 60분 간격 · 정원 4명" */
  ruleLabel: string
  /** 생기는 시간 "16:00, 17:00" */
  timesLabel: string
}

/** 운영 규칙을 등록 화면의 그룹(seriesId) 단위로 요약한다. 그룹 안에서는 요일마다 시간 · 정원이 같다. */
export const presentOperatingRuleGroups = (rule: ClassOperatingRule): OperatingRuleGroupPresentation[] => {
  const minutes = getOperatingRuleSlotMinutes(rule)
  return [...new Set(rule.slots.map((slot) => slot.seriesId))].map((seriesId) => {
    const series = rule.slots.filter((slot) => slot.seriesId === seriesId)
    const weekdays = [...new Set(series.map((slot) => slot.weekday))].sort(
      (left, right) => WEEKDAY_ORDER.indexOf(left) - WEEKDAY_ORDER.indexOf(right)
    )
    const daySlots = series.filter((slot) => slot.weekday === weekdays[0]).sort((a, b) => a.startTime.localeCompare(b.startTime))
    const capacities = [...new Set(daySlots.map((slot) => slot.capacity))].sort((a, b) => a - b)
    const capacityLabel =
      capacities.length === 1 ? `정원 ${capacities[0]}명` : `정원 ${capacities[0]}~${capacities[capacities.length - 1]}명`
    const first = daySlots[0]
    const last = daySlots[daySlots.length - 1]
    const times = daySlots.map((slot) => format24HourTime(slot.startTime))
    return {
      id: seriesId,
      weekdayLabel: `매주 ${weekdays.map((weekday) => weekdayLabels[weekday] ?? "").join(" · ")}`,
      ruleLabel: [
        first && last ? `${format24HourTime(first.startTime)} – ${format24HourTime(last.endTime)}` : null,
        minutes ? `${minutes}분 간격` : null,
        capacityLabel
      ]
        .filter(Boolean)
        .join(" · "),
      timesLabel: times.length <= 6 ? times.join(", ") : `${times.slice(0, 6).join(", ")} 외 ${times.length - 6}개`
    }
  })
}
