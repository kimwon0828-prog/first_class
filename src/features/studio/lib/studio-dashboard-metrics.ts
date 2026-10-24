// Dashboard performance summary.
//
// 기간은 각 milestone 발생일이 아니라 신청 created_at cohort 를 고른다. 그래야
// 신청 접수 → 일정 확정 → 체험 진행 → 체험 완료 → 등록 결과 숫자가 같은 모집단을 공유하고,
// 단계 사이 비율도 실제 conversion 으로 읽을 수 있다.
//
// application_logs 를 추가 조회하지 않는다. 기본 상태 계약이 순차적이므로 현재 Case
// stage 로 누적 도달 여부를 판정한다. canceled/no_show 는 어느 단계에서 이탈했는지
// summary 만으로 알 수 없어 신청 수에만 포함한다.

import { isTrialStarted } from "./trial-completion"
import { resolveNotEnrolledReasonIds, type NotEnrolledReasonId } from "@/features/registration/lib/registration-input"
import { getCaseStage, type CaseStage } from "@/features/studio/lib/case-view-model"
import type { StudioResolvedDateRange } from "@/features/studio/lib/studio-date-range"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

export type StudioDashboardMetricKey =
  | "application"
  | "in_trial"
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
 *
 * 사유는 새 목록(registration-input.ts 의 NOT_ENROLLED_REASONS) 기준이다. 저장은
 * registration_reason_ids(복수 선택)이고, 옛 단일 값(unregistered_reason)은 새 분류로 옮겨 센다
 * (resolveNotEnrolledReasonIds). 한 학생이 사유를 여러 개 골랐으면 사유마다 1명으로 센다 —
 * 그래서 합계는 미등록 수 이상이다. 사유가 없는 학생은 reason null 로 한 번 센다(버리지 않는다).
 *
 * 라벨·상위 N·기타 묶기는 여기서 하지 않는다(표시 계층의 몫).
 */
export type StudioDashboardUnregisteredReasonCount = {
  reason: NotEnrolledReasonId | null
  count: number
}

/**
 * 등록 전환율의 유일한 정의: 등록 ÷ 체험 완료(대표 결정, 2026-10).
 *
 * 분석 화면 · 홈 "이번 달 등록 전환" · 6개월 막대 · 성과 리포트가 모두 이 함수를 쓴다.
 * 결과가 아직 없는 학생(결과 대기)도 분모에 들어간다. 체험 완료가 0 이면 null.
 * 소수 첫째 자리까지 돌려준다. 화면은 formatEnrollmentRate 로 정수 % 를 적는다.
 */
export const computeTrialEnrollmentRate = (enrolledCount: number, trialCompletedCount: number): number | null =>
  trialCompletedCount > 0 ? Math.round((enrolledCount / trialCompletedCount) * 1000) / 10 : null

/** "39%" — 전환율 화면 표기(정수 반올림). 값이 없으면 "—". */
export const formatEnrollmentRate = (rate: number | null): string => (rate == null ? "—" : `${Math.round(rate)}%`)

export type StudioDashboardMetrics = {
  periodLabel: string
  /** 같은 신청일 cohort의 현재 저장 상태 분포. */
  trialOutcomes: { completed: number; noShow: number; canceled: number; pending: number }
  steps: StudioDashboardMetricStep[]
  /** 일정 확정 단계에 도달한 수(불참 · 취소는 포함하지 않는다). */
  confirmedCount: number
  /** 체험을 마친 학생 수(= 전환율의 분모). */
  completedCount: number
  enrolledCount: number
  notEnrolledCount: number
  decidedCount: number
  /** 결과 대기: 체험을 마쳤지만 등록 · 미등록 결과가 아직 없다. */
  pendingDecisionCount: number
  /** 등록 ÷ 체험 완료(computeTrialEnrollmentRate). */
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

export const isCreatedWithinRange = (
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
  range: StudioResolvedDateRange,
  now: Date = new Date()
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
    reachedCount(2),
    cohort.filter((item, index) => (STAGE_REACHED_LEVEL[stages[index]] ?? 0) >= 3 || (item.status === "confirmed" && isTrialStarted(item, now))).length,
    reachedCount(3),
    stages.filter((stage) => stage === "enrolled").length
  ]
  // new/reviewing은 접수 cohort에만 포함. 등록 결과 수치는 기존 등록 완료 건수를 유지한다.
  const labels = ["신청 접수", "일정 확정", "체험 진행", "체험 완료", "등록 결과"]
  const keys: StudioDashboardMetricKey[] = [
    "application",
    "confirmed",
    "in_trial",
    "completed",
    "enrolled"
  ]
  const enrolledCount = counts[4]
  const notEnrolledCount = stages.filter((stage) => stage === "not_enrolled").length
  const decidedCount = enrolledCount + notEnrolledCount

  // 미등록으로 종결한 Case 만 센다. 다른 상태에 사유 값이 남아 있어도 집계하지 않는다.
  const reasonCountMap = new Map<NotEnrolledReasonId | null, number>()
  cohort.forEach((item, index) => {
    if (stages[index] !== "not_enrolled") {
      return
    }

    const reasons = resolveNotEnrolledReasonIds(item)
    for (const reason of reasons.length > 0 ? reasons : [null]) {
      reasonCountMap.set(reason, (reasonCountMap.get(reason) ?? 0) + 1)
    }
  })

  return {
    periodLabel: range.label,
    trialOutcomes: {
      completed: cohort.filter(item => item.status === "completed").length,
      noShow: cohort.filter(item => item.status === "canceled" && item.noShowAt != null).length,
      canceled: cohort.filter(item => item.status === "canceled" && item.noShowAt == null).length,
      pending: cohort.filter(item => item.status !== "completed" && item.status !== "canceled").length
    },
    steps: counts.map((count, index) => ({
      key: keys[index],
      label: labels[index],
      count,
      conversionFromPrevious:
        index === 0 ? null : roundPercentage(count, counts[index - 1])
    })),
    confirmedCount: counts[1],
    completedCount: counts[3],
    enrolledCount,
    notEnrolledCount,
    decidedCount,
    pendingDecisionCount: Math.max(0, counts[3] - decidedCount),
    registrationConversionRate: computeTrialEnrollmentRate(enrolledCount, counts[3]),
    unregisteredReasonCounts: Array.from(reasonCountMap.entries()).map(([reason, count]) => ({
      reason,
      count
    }))
  }
}
