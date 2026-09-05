// Dashboard 성과 분석의 표시 모델.
//
// 계산은 하지 않는다. studio-dashboard-metrics 가 이미 만든 숫자를
// bar / donut 이 바로 그릴 수 있는 형태로 바꾸기만 한다.
// metric formula 는 이 파일에 없다.

import {
  TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS,
  getTrialResultUnregisteredReasonLabel
} from "@/features/studio/lib/trial-result-options"
import type {
  StudioDashboardMetricKey,
  StudioDashboardMetrics
} from "@/features/studio/lib/studio-dashboard-metrics"

export type StudioDashboardStageBar = {
  key: StudioDashboardMetricKey
  label: string
  count: number
  /** track 대비 fill 비율(%). 신청 수가 분모다. */
  fillPercent: number
  /** "신청 대비 N%" 문구. 첫 단계(항상 100%)는 null 이라 반복되지 않는다. */
  reachedLabel: string | null
}

export type StudioDashboardDonutSegment = {
  key: "enrolled" | "not_enrolled" | "pending"
  label: string
  count: number
  /** SVG stroke-dasharray 의 앞 값(원둘레 기준 길이). */
  dashLength: number
  /** stroke-dashoffset. 앞 segment 들의 길이 합만큼 음수로 민다. */
  dashOffset: number
}

/**
 * 미등록 사유 표시 목록.
 *
 * 많은 순으로 정렬하고, 동률이면 사유 선택지의 원래 순서를 따른다(사유 미기록은 맨 뒤).
 * 정렬만 하고 상위 N 이나 묶기는 하지 않는다 — 그건 리포트가 정한다.
 */
export type StudioDashboardUnregisteredReason = {
  /** 사유 코드. 사유가 없는 Case 는 null 이다. */
  key: string
  label: string
  count: number
}

export type StudioDashboardAnalytics = {
  stageBars: StudioDashboardStageBar[]
  donutSegments: StudioDashboardDonutSegment[]
  donutTotal: number
  donutCircumference: number
  conversionValue: string
  conversionMeta: string
  hasCohort: boolean
  hasDonutData: boolean
  unregisteredReasons: StudioDashboardUnregisteredReason[]
}

/** viewBox 120 기준. r 은 stroke 두께를 뺀 값이라 원이 잘리지 않는다. */
export const STUDIO_DONUT_VIEWBOX = 120
export const STUDIO_DONUT_RADIUS = 52
export const STUDIO_DONUT_STROKE = 14

const DONUT_CIRCUMFERENCE = 2 * Math.PI * STUDIO_DONUT_RADIUS

/** metrics 의 roundPercentage 와 같은 규칙(소수 첫째 자리)이다. 화면에서 반올림이 갈리지 않게 한다. */
const toFixedPercent = (value: number | null) => (value == null ? "—" : `${value.toFixed(1)}%`)

const toRatioPercent = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0

export const buildStudioDashboardAnalytics = (
  metrics: StudioDashboardMetrics
): StudioDashboardAnalytics => {
  const applicationCount = metrics.steps[0]?.count ?? 0

  const stageBars = metrics.steps.map<StudioDashboardStageBar>((step, index) => {
    const reached = toRatioPercent(step.count, applicationCount)
    return {
      key: step.key,
      label: step.label,
      count: step.count,
      fillPercent: reached,
      // 첫 단계는 언제나 100% 라 정보가 없다.
      reachedLabel: index === 0 ? null : `신청 대비 ${reached.toFixed(1)}%`
    }
  })

  const segmentInput: Array<{ key: StudioDashboardDonutSegment["key"]; label: string; count: number }> = [
    { key: "enrolled", label: "등록", count: metrics.enrolledCount },
    { key: "not_enrolled", label: "미등록", count: metrics.notEnrolledCount },
    { key: "pending", label: "결정 대기", count: metrics.pendingDecisionCount }
  ]
  const donutTotal = segmentInput.reduce((sum, segment) => sum + segment.count, 0)

  let consumed = 0
  const donutSegments = segmentInput.map<StudioDashboardDonutSegment>((segment) => {
    const dashLength = donutTotal > 0 ? (segment.count / donutTotal) * DONUT_CIRCUMFERENCE : 0
    const dashOffset = -consumed
    consumed += dashLength
    return { ...segment, dashLength, dashOffset }
  })

  // 사유가 없는 Case 도 버리지 않는다. 목록의 합이 미등록 수와 같아야 한다.
  const MISSING_REASON_KEY = "unrecorded"
  const MISSING_REASON_LABEL = "미등록 사유 미기록"
  const reasonOrder = new Map(
    TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS.map((option, index) => [option.value, index])
  )
  const unregisteredReasons = metrics.unregisteredReasonCounts
    .map((item) => ({
      key: item.reason ?? MISSING_REASON_KEY,
      label: item.reason
        ? getTrialResultUnregisteredReasonLabel(item.reason) ?? MISSING_REASON_LABEL
        : MISSING_REASON_LABEL,
      count: item.count,
      order: item.reason
        ? reasonOrder.get(item.reason) ?? TRIAL_RESULT_UNREGISTERED_REASON_OPTIONS.length
        : Number.MAX_SAFE_INTEGER
    }))
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .map(({ key, label, count }) => ({ key, label, count }))

  return {
    stageBars,
    donutSegments,
    donutTotal,
    donutCircumference: DONUT_CIRCUMFERENCE,
    conversionValue: toFixedPercent(metrics.registrationConversionRate),
    conversionMeta:
      metrics.decidedCount > 0
        ? `결정 완료 ${metrics.decidedCount}건 중 ${metrics.enrolledCount}건 등록`
        : "아직 등록 결정이 없습니다",
    hasCohort: applicationCount > 0,
    hasDonutData: donutTotal > 0,
    unregisteredReasons
  }
}
