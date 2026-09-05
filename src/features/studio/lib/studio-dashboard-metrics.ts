// Dashboard performance summary.
//
// 기간은 각 milestone 발생일이 아니라 신청 created_at cohort 를 고른다. 그래야
// 신청 → 신청 확인 → 일정 확정 → 체험 완료 → 등록 숫자가 같은 모집단을 공유하고,
// 단계 사이 비율도 실제 conversion 으로 읽을 수 있다.
//
// application_logs 를 추가 조회하지 않는다. 기본 상태 계약이 순차적이므로 현재 Case
// stage 로 누적 도달 여부를 판정한다. canceled/no_show 는 어느 단계에서 이탈했는지
// summary 만으로 알 수 없어 신청 수에만 포함한다.

import { getCaseStage, type CaseStage } from "@/features/studio/lib/case-view-model"
import type { StudioResolvedDateRange } from "@/features/studio/lib/studio-date-range"
import type {
  ApplicationUnregisteredReason,
  StudioApplicationSummary
} from "@/shared/lib/db/adapter"

export type StudioDashboardMetricKey =
  | "application"
  | "reviewing"
  | "confirmed"
  | "completed"
  | "enrolled"

export type StudioDashboardMetricStep = {
  key: StudioDashboardMetricKey
  label: string
  count: number
  conversionFromPrevious: number | null
}

/**
 * 미등록으로 종결한 Case 의 사유 분포.
 *
 * 같은 cohort(선택 기간의 created_at) 안에서만 센다. 상담 이력의 과거 스냅샷이 아니라
 * Case 의 현재 결과만 본다 — Dashboard 의 다른 지표와 같은 기준이다.
 * reason 이 null 인 Case 도 버리지 않는다. 합계가 미등록 수와 어긋나면 안 되기 때문이다.
 *
 * 라벨·상위 N·기타 묶기는 여기서 하지 않는다(표시 계층의 몫).
 */
export type StudioDashboardUnregisteredReasonCount = {
  reason: ApplicationUnregisteredReason | null
  count: number
}

export type StudioDashboardMetrics = {
  periodLabel: string
  steps: StudioDashboardMetricStep[]
  enrolledCount: number
  notEnrolledCount: number
  decidedCount: number
  pendingDecisionCount: number
  registrationConversionRate: number | null
  unregisteredReasonCounts: StudioDashboardUnregisteredReasonCount[]
}

const STAGE_REACHED_LEVEL: Partial<Record<CaseStage, number>> = {
  reviewing: 1,
  confirmed: 2,
  completed: 3,
  enrolled: 4,
  not_enrolled: 3
}

const roundPercentage = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

const isCreatedWithinRange = (
  item: StudioApplicationSummary,
  range: Pick<StudioResolvedDateRange, "createdAtFrom" | "createdAtTo">
) => {
  if (!range.createdAtFrom && !range.createdAtTo) {
    return true
  }

  const createdAt = toTimestamp(item.createdAt)
  if (createdAt == null) {
    return false
  }

  const from = toTimestamp(range.createdAtFrom)
  const to = toTimestamp(range.createdAtTo)
  return (from == null || createdAt >= from) && (to == null || createdAt <= to)
}

export const buildStudioDashboardMetrics = (
  applications: StudioApplicationSummary[],
  range: StudioResolvedDateRange
): StudioDashboardMetrics => {
  const cohort = applications.filter((item) => isCreatedWithinRange(item, range))
  const stages = cohort.map((item) =>
    getCaseStage({
      status: item.status,
      noShowAt: item.noShowAt,
      registrationStatus: item.registrationStatus ?? "undecided"
    })
  )

  const reachedCount = (level: number) =>
    stages.filter((stage) => (STAGE_REACHED_LEVEL[stage] ?? 0) >= level).length

  const counts = [
    cohort.length,
    reachedCount(1),
    reachedCount(2),
    reachedCount(3),
    stages.filter((stage) => stage === "enrolled").length
  ]
  // reviewing 의 Dashboard 표기다. DB status 계약(reviewing)은 그대로다.
  const labels = ["신청", "신청 확인", "일정 확정", "체험 완료", "등록"]
  const keys: StudioDashboardMetricKey[] = [
    "application",
    "reviewing",
    "confirmed",
    "completed",
    "enrolled"
  ]
  const enrolledCount = counts[4]
  const notEnrolledCount = stages.filter((stage) => stage === "not_enrolled").length
  const decidedCount = enrolledCount + notEnrolledCount

  // 미등록으로 종결한 Case 만 센다. 다른 상태에 사유 값이 남아 있어도 집계하지 않는다.
  const reasonCountMap = new Map<ApplicationUnregisteredReason | null, number>()
  cohort.forEach((item, index) => {
    if (stages[index] !== "not_enrolled") {
      return
    }

    const reason = item.unregisteredReason ?? null
    reasonCountMap.set(reason, (reasonCountMap.get(reason) ?? 0) + 1)
  })

  return {
    periodLabel: range.label,
    steps: counts.map((count, index) => ({
      key: keys[index],
      label: labels[index],
      count,
      conversionFromPrevious:
        index === 0 ? null : roundPercentage(count, counts[index - 1])
    })),
    enrolledCount,
    notEnrolledCount,
    decidedCount,
    pendingDecisionCount: Math.max(0, counts[3] - decidedCount),
    registrationConversionRate: roundPercentage(enrolledCount, decidedCount),
    unregisteredReasonCounts: Array.from(reasonCountMap.entries()).map(([reason, count]) => ({
      reason,
      count
    }))
  }
}
