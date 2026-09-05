// 공유용 등록전환 리포트의 표시 모델.
//
// ⚠️ 여기에 지표 계산식이 없다.
//   숫자의 유일한 주인은 studio-dashboard-metrics 다.
//   이 파일은 그 결과와 dashboard analytics 표시값을 한 장짜리 리포트 구조로 바꾸기만 한다.
//   같은 기간에 대해 Dashboard 와 리포트가 다른 숫자를 보이면 그건 버그다.
//
// bar 너비 같은 값은 지표가 아니라 그림의 기하학이다. KPI 와 섞이지 않도록
// visual 접두사를 붙여 따로 둔다.

import type { StudioDashboardAnalytics } from "@/features/studio/lib/studio-dashboard-analytics"
import type {
  StudioDashboardMetricKey,
  StudioDashboardMetrics
} from "@/features/studio/lib/studio-dashboard-metrics"
import { SEOUL_TIME_ZONE } from "@/shared/lib/seoul-datetime"

export type ConversionInfographicFunnelStep = {
  key: StudioDashboardMetricKey
  label: string
  count: number
  /** 막대 길이(%). 첫 단계 대비 비율이며 지표가 아니라 그림용 값이다. */
  visualFillPercent: number
}

export type ConversionInfographicDecisionSegment = {
  key: "enrolled" | "pending" | "not_enrolled"
  label: string
  count: number
  /** 가로 누적 막대의 길이(%). 합이 0이면 전부 0이다. */
  visualSharePercent: number
}

export type ConversionInfographicReason = {
  key: string
  label: string
  count: number
  /** 가장 많은 사유 대비 막대 길이(%). 지표가 아니라 그림용 값이다. */
  visualFillPercent: number
}

export type ConversionInfographicModel = {
  organizationName: string
  periodLabel: string
  generatedDateLabel: string
  /** dashboard 와 같은 문자열. 0/0 이면 "—" 다. */
  conversionRateLabel: string
  conversionMeta: string
  funnel: ConversionInfographicFunnelStep[]
  decisions: ConversionInfographicDecisionSegment[]
  decisionTotal: number
  /** 상위 3개 + 나머지 합계. 사유가 없으면 빈 배열이고 그 경우 섹션을 그리지 않는다. */
  topUnregisteredReasons: ConversionInfographicReason[]
  /** 신청 수에 취소·노쇼가 포함된다는 사실을 알리는 각주. */
  applicationFootnote: string
}

export const CONVERSION_INFOGRAPHIC_WIDTH = 1080
export const CONVERSION_INFOGRAPHIC_HEIGHT = 1350

/**
 * 리포트에 보여줄 사유 개수.
 *
 * 나머지는 하나로 묶는다. 묶음 이름은 "기타" 가 아니라 "그 외" 다 —
 * canonical 사유 목록에 이미 "기타"(other) 가 있어서 서로 다른 뜻이 겹치면 안 된다.
 */
const REPORT_REASON_LIMIT = 3
const REMAINDER_REASON_KEY = "remainder"
const REMAINDER_REASON_LABEL = "그 외"

const APPLICATION_FOOTNOTE =
  "신청 수에는 해당 기간에 접수된 취소·노쇼 신청이 포함됩니다."

/** 첫 단계 대비 비율. 신청이 0건이면 0으로 둔다(0 나누기 방어). */
const toVisualPercent = (count: number, base: number) =>
  base > 0 ? Math.min(100, Math.max(0, (count / base) * 100)) : 0

export const formatSeoulReportDate = (value: Date) => {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value)

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return `${pick("year")}.${pick("month")}.${pick("day")}`
}

export type ConversionInfographicInput = {
  organizationName: string
  metrics: StudioDashboardMetrics
  analytics: StudioDashboardAnalytics
  generatedAt: Date
}

/**
 * 상위 사유 + 나머지 묶음.
 *
 * 순서와 라벨은 analytics 가 정한 것을 그대로 쓴다. 여기서 하는 일은
 * 상위 몇 개만 남기고 나머지를 한 줄로 합치는 표시용 묶기뿐이다.
 */
const buildTopReasons = (
  reasons: StudioDashboardAnalytics["unregisteredReasons"]
): ConversionInfographicReason[] => {
  if (reasons.length === 0) {
    return []
  }

  const top = reasons.slice(0, REPORT_REASON_LIMIT)
  const remainderCount = reasons
    .slice(REPORT_REASON_LIMIT)
    .reduce((sum, item) => sum + item.count, 0)

  const rows = [
    ...top.map((item) => ({ key: item.key, label: item.label, count: item.count })),
    ...(remainderCount > 0
      ? [{ key: REMAINDER_REASON_KEY, label: REMAINDER_REASON_LABEL, count: remainderCount }]
      : [])
  ]

  const maxCount = rows.reduce((max, item) => Math.max(max, item.count), 0)
  return rows.map((item) => ({
    ...item,
    visualFillPercent: toVisualPercent(item.count, maxCount)
  }))
}

/**
 * 대시보드 지표를 리포트 구조로 바꾼다.
 *
 * 숫자는 전부 metrics/analytics 에서 그대로 가져온다. 새로 세지 않는다.
 */
export const buildConversionInfographicModel = ({
  organizationName,
  metrics,
  analytics,
  generatedAt
}: ConversionInfographicInput): ConversionInfographicModel => {
  const applicationCount = metrics.steps[0]?.count ?? 0

  const funnel = metrics.steps.map<ConversionInfographicFunnelStep>((step) => ({
    key: step.key,
    // 첫 단계만 "총 신청" 으로 읽히게 한다. 나머지 라벨은 Dashboard 와 같다.
    label: step.key === "application" ? "총 신청" : step.label,
    count: step.count,
    visualFillPercent: toVisualPercent(step.count, applicationCount)
  }))

  const decisionInput = [
    { key: "enrolled" as const, label: "등록", count: metrics.enrolledCount },
    { key: "pending" as const, label: "결정 대기", count: metrics.pendingDecisionCount },
    { key: "not_enrolled" as const, label: "미등록", count: metrics.notEnrolledCount }
  ]
  const decisionTotal = decisionInput.reduce((sum, item) => sum + item.count, 0)

  return {
    organizationName,
    periodLabel: metrics.periodLabel,
    generatedDateLabel: formatSeoulReportDate(generatedAt),
    // dashboard 가 만든 문자열을 그대로 쓴다. 반올림 규칙이 갈리지 않는다.
    conversionRateLabel: analytics.conversionValue,
    conversionMeta: analytics.conversionMeta,
    funnel,
    decisions: decisionInput.map((item) => ({
      ...item,
      visualSharePercent: toVisualPercent(item.count, decisionTotal)
    })),
    decisionTotal,
    topUnregisteredReasons: buildTopReasons(analytics.unregisteredReasons),
    applicationFootnote: APPLICATION_FOOTNOTE
  }
}

/**
 * 파일명에 넣을 기간 표기.
 *
 *   전체            → "전체"
 *   같은 달 전체    → "2026-09"
 *   그 외           → "2026-09-01_2026-09-30"
 */
export const buildConversionInfographicPeriodFileLabel = (range: {
  startDate: string | null
  endDate: string | null
}) => {
  if (!range.startDate || !range.endDate) {
    return "전체"
  }

  const startMonth = range.startDate.slice(0, 7)
  const endMonth = range.endDate.slice(0, 7)
  const isWholeMonth =
    startMonth === endMonth &&
    range.startDate.endsWith("-01") &&
    // 다음 달 1일에서 하루 뺀 날이면 그 달의 마지막 날이다.
    new Date(`${range.endDate}T00:00:00Z`).getUTCDate() ===
      new Date(Date.UTC(Number(startMonth.slice(0, 4)), Number(startMonth.slice(5, 7)), 0)).getUTCDate()

  return isWholeMonth ? startMonth : `${range.startDate}_${range.endDate}`
}

const UNSAFE_FILE_NAME_PATTERN = /[\\/:*?"<>|\s]+/g

/** 첫수업_등록전환리포트_학원명_기간.png */
export const buildConversionInfographicFileName = (input: {
  organizationName: string
  periodFileLabel: string
}) => {
  const academy = input.organizationName.replace(UNSAFE_FILE_NAME_PATTERN, "") || "학원"
  const period = input.periodFileLabel.replace(UNSAFE_FILE_NAME_PATTERN, "") || "전체"
  return `첫수업_등록전환리포트_${academy}_${period}.png`
}
