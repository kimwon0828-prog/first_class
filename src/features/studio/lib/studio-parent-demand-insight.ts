// Dashboard의 학부모 희망 시간 분석 표시 모델.
//
// 학부모가 처음 선택한 requested_slot_at만 사용한다. 확정/변경된 일정은 섞지 않는다.
// KST civil parts를 한 번만 읽고 요일, 시간, 요일×시간을 같은 O(n) loop에서 집계한다.

import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

/** 10건 미만에서는 순위가 몇 건의 우연에 크게 흔들리므로 insight를 숨긴다. */
export const STUDIO_PREFERRED_TIME_MIN_SAMPLE_SIZE = 10
export const STUDIO_PREFERRED_TIME_RANKING_LIMIT = 3
export const STUDIO_PREFERRED_TIME_COMBINATION_LIMIT = 2

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const
const WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일"
] as const
const WEEKDAY_ORDER_INDEX = new Map<number, number>(
  WEEKDAY_ORDER.map((weekday, index) => [weekday, index])
)

export type StudioPreferredTimeRankingItem = {
  key: string
  label: string
  count: number
  percentage: number
  /** ranking 안의 최다 count 대비 bar 길이. */
  relativePercent: number
}

export type StudioPreferredTimeCombination = StudioPreferredTimeRankingItem & {
  weekday: number
  hour: number
}

export type StudioPreferredTimeInsight = {
  cohortCount: number
  totalCount: number
  invalidCount: number
  hasSufficientSample: boolean
  topCombinations: StudioPreferredTimeCombination[]
  topCombinationTieCount: number
  weekdayRanking: StudioPreferredTimeRankingItem[]
  hourRanking: StudioPreferredTimeRankingItem[]
}

type CountEntry = {
  key: string
  label: string
  count: number
}

const roundPercentage = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0

const toRankingItems = (
  entries: CountEntry[],
  cohortCount: number,
  limit: number
): StudioPreferredTimeRankingItem[] => {
  const maxCount = entries[0]?.count ?? 0

  return entries.slice(0, limit).map((entry) => ({
    ...entry,
    percentage: roundPercentage(entry.count, cohortCount),
    relativePercent: roundPercentage(entry.count, maxCount)
  }))
}

export const buildStudioPreferredTimeInsight = (
  cohort: StudioApplicationSummary[]
): StudioPreferredTimeInsight => {
  const weekdayCounts = new Map<number, number>()
  const hourCounts = new Map<number, number>()
  const combinationCounts = new Map<string, { weekday: number; hour: number; count: number }>()
  let totalCount = 0

  for (const application of cohort) {
    const parts = getSeoulDateTimeParts(application.requestedSlotAt)
    if (!parts) {
      continue
    }

    totalCount += 1
    weekdayCounts.set(parts.weekday, (weekdayCounts.get(parts.weekday) ?? 0) + 1)
    hourCounts.set(parts.hour, (hourCounts.get(parts.hour) ?? 0) + 1)

    const combinationKey = `${parts.weekday}:${parts.hour}`
    const combination = combinationCounts.get(combinationKey)
    if (combination) {
      combination.count += 1
    } else {
      combinationCounts.set(combinationKey, {
        weekday: parts.weekday,
        hour: parts.hour,
        count: 1
      })
    }
  }

  const weekdayEntries = WEEKDAY_ORDER.map((weekday) => ({
    key: String(weekday),
    label: WEEKDAY_LABELS[weekday],
    count: weekdayCounts.get(weekday) ?? 0
  }))
    .filter((entry) => entry.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count ||
        (WEEKDAY_ORDER_INDEX.get(Number(left.key)) ?? 0) -
          (WEEKDAY_ORDER_INDEX.get(Number(right.key)) ?? 0)
    )

  const hourEntries = Array.from(hourCounts.entries())
    .map(([hour, count]) => ({ key: String(hour), label: `${hour}시`, count }))
    .sort((left, right) => right.count - left.count || Number(left.key) - Number(right.key))

  // 공동 1위도 항상 같은 순서다: count desc → 월~일 → 이른 hour.
  const combinationEntries = Array.from(combinationCounts.values()).sort(
    (left, right) =>
      right.count - left.count ||
      (WEEKDAY_ORDER_INDEX.get(left.weekday) ?? 0) -
        (WEEKDAY_ORDER_INDEX.get(right.weekday) ?? 0) ||
      left.hour - right.hour
  )
  const maxCombinationCount = combinationEntries[0]?.count ?? 0
  const tiedTopCombinations = combinationEntries.filter(
    (entry) => entry.count === maxCombinationCount
  )
  const topCombinations = tiedTopCombinations
    .slice(0, STUDIO_PREFERRED_TIME_COMBINATION_LIMIT)
    .map<StudioPreferredTimeCombination>((entry) => ({
      key: `${entry.weekday}:${entry.hour}`,
      label: `${WEEKDAY_LABELS[entry.weekday]} · ${entry.hour}시`,
      weekday: entry.weekday,
      hour: entry.hour,
      count: entry.count,
      percentage: roundPercentage(entry.count, cohort.length),
      relativePercent: 100
    }))

  return {
    cohortCount: cohort.length,
    totalCount,
    invalidCount: cohort.length - totalCount,
    hasSufficientSample: totalCount >= STUDIO_PREFERRED_TIME_MIN_SAMPLE_SIZE,
    topCombinations,
    topCombinationTieCount: tiedTopCombinations.length,
    weekdayRanking: toRankingItems(
      weekdayEntries,
      cohort.length,
      STUDIO_PREFERRED_TIME_RANKING_LIMIT
    ),
    hourRanking: toRankingItems(hourEntries, cohort.length, STUDIO_PREFERRED_TIME_RANKING_LIMIT)
  }
}
