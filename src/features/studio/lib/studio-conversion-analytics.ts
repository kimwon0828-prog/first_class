// 체험 이후 전환 현황.
//
// 원장이 알고 싶은 것은 "체험을 진행한 학생들이 이후 어떻게 됐는가" 다.
// 그 답은 서로 다른 네 개의 사실에서 나온다.
//
//   Experience           체험을 마쳤는가        trial_applications.status = completed
//   Report               리포트를 발행했는가     experience_reports (지금 살아 있는 발행본)
//   ParentDecision       부모가 생각을 남겼는가   parent_decisions (지금의 선택)
//   RegistrationResult   실제 결과가 확정됐는가   registration_results (지금의 결과)
//
// ⚠️ 네 단계는 순서대로 일어나지 않는다.
//
//    리포트 없이 등록이 확정되기도 하고, 부모가 아무것도 남기지 않은 채
//    등록되기도 한다. 그래서 이것을 깔때기(funnel)로 그리지 않는다 —
//    각 단계가 앞 단계의 부분집합이라는 보장이 없는데 "다음 단계 전환율" 을
//    말하면 그건 없는 관계를 있다고 하는 것이다.
//
// ⚠️ 서로를 추정하지 않는다.
//
//    registration_status 로 ParentDecision 을 짐작하지 않고, ParentDecision 으로
//    등록 결과를 짐작하지 않는다. pending / undecided 는 결과값이 아니다.
//    trial_results 가 있다고 "리포트가 발행됐다" 고 세지 않는다.
//
// ⚠️ 원인을 말하지 않는다.
//
//    관측된 수를 그대로 보여 준다. 무엇 덕분에 등록했는지는 이 데이터로
//    알 수 없고, 알 수 없는 것을 아는 척하면 원장은 잘못된 판단을 한다.

import type { ParentDecision } from "@/features/decisions/lib/parent-decision"
import type { RegistrationResult } from "@/features/registration/lib/registration-result"
import type { StudioResolvedDateRange } from "@/features/studio/lib/studio-date-range"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

/**
 * cohort 에 들어온 체험 하나에 딸린 현재 사실들.
 *
 * 전부 "지금" 의 값이다. superseded 된 옛 기록은 애초에 들어오지 않는다 —
 * 과거 시점 분석은 R7 범위가 아니고, 이력은 DB 에 그대로 남아 있다.
 */
export type StudioConversionSources = {
  /** 지금 살아 있는 발행본이 있는 체험의 id. */
  publishedReportExperienceIds: ReadonlySet<string>
  /** 체험 id → 지금의 부모 선택. */
  parentDecisionByExperienceId: ReadonlyMap<string, ParentDecision>
  /** 체험 id → 지금의 등록 결과. */
  registrationResultByExperienceId: ReadonlyMap<string, RegistrationResult>
}

export const PARENT_DECISION_KEYS = ["planned", "considering", "declined"] as const
export const REGISTRATION_RESULT_KEYS = ["enrolled", "not_enrolled"] as const

/**
 * 부모 의향 × 실제 결과.
 *
 * 열에 result_pending 이 있다. 결과가 아직 없는 것을 "미등록" 칸에 넣으면
 * 아직 이야기가 끝나지 않은 학생이 이탈로 집계된다.
 */
export type StudioConversionMatrixColumn = "enrolled" | "not_enrolled" | "result_pending"

export type StudioConversionMatrixRow = {
  decision: ParentDecision
  enrolled: number
  notEnrolled: number
  resultPending: number
  total: number
}

export type StudioConversionAnalytics = {
  periodLabel: string

  cohort: {
    /** 선택 기간에 체험을 마친 Experience 수. 모든 분모의 출발점이다. */
    completedExperienceCount: number
  }

  reports: {
    publishedExperienceCount: number
    /** 체험 완료 중 리포트가 발행된 비율. */
    coverageRate: number | null
  }

  parentDecisions: {
    total: number
    planned: number
    considering: number
    declined: number
    /** 아직 아무것도 남기지 않은 체험 수. "거절" 이 아니다. */
    notCollected: number
  }

  registrationResults: {
    total: number
    enrolled: number
    notEnrolled: number
    /**
     * 결과가 아직 확정되지 않은 체험 수.
     *
     * ⚠️ 미등록이 아니다. 미등록은 학원이 "등록하지 않음" 으로 확정한 결과고,
     *    이건 아직 확정되지 않았다는 뜻이다. 둘을 합치면 상담이 진행 중인
     *    학생이 이탈한 것처럼 보인다.
     */
    unresolved: number
  }

  rates: {
    /** enrolled / 체험 완료. 분모를 화면에 반드시 같이 적는다. */
    overallEnrollmentRate: number | null
    overallNumerator: number
    overallDenominator: number
    /** enrolled / 결과가 확정된 체험. 위와 다른 지표다 — 섞지 않는다. */
    resolvedEnrollmentRate: number | null
    resolvedNumerator: number
    resolvedDenominator: number
  }

  /** 부모 의향이 있는 체험만 대상이다. 의향 미확인은 matrix 밖 notCollected 로 센다. */
  decisionResultMatrix: StudioConversionMatrixRow[]
  decisionResultMatrixTotal: number

  hasCohort: boolean
}

/** 소수 첫째 자리. 기존 dashboard metrics 와 같은 규칙이라 화면에서 반올림이 갈리지 않는다. */
const roundPercentage = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null

const toTimestamp = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

/**
 * 체험이 실제로 일어난 날.
 *
 * Record 화면과 같은 후보 순서다(confirmed → requested → completed → canceled → created).
 * Analytics 가 날짜 규칙을 따로 만들면 같은 체험이 화면마다 다른 달에 들어간다.
 */
export const resolveStudioExperienceDate = (
  item: Pick<
    StudioApplicationSummary,
    "confirmedSlotAt" | "requestedSlotAt" | "completedAt" | "canceledAt" | "createdAt"
  >
): string => {
  const candidates = [
    item.confirmedSlotAt,
    item.requestedSlotAt,
    item.completedAt,
    item.canceledAt,
    item.createdAt
  ]

  for (const value of candidates) {
    if (value && !Number.isNaN(new Date(value).getTime())) {
      return value
    }
  }

  return item.createdAt
}

/**
 * cohort 판정.
 *
 * ⚠️ 체험 날짜로 고른다. 결과가 기록된 날이 아니다.
 *
 *    등록이 이번 달에 확정됐다고 지난달 체험을 이번 달로 옮기면, 같은 체험이
 *    달마다 다시 나타나고 지난달 숫자가 뒤늦게 바뀐다. cohort 는 체험 시점에
 *    고정하고, 그 체험의 결과를 지금 값으로 따라간다.
 */
export const selectConversionCohort = (
  applications: StudioApplicationSummary[],
  range: Pick<StudioResolvedDateRange, "createdAtFrom" | "createdAtTo">
): StudioApplicationSummary[] => {
  const from = toTimestamp(range.createdAtFrom)
  const to = toTimestamp(range.createdAtTo)

  return applications.filter((item) => {
    if (item.status !== "completed") {
      return false
    }

    if (from == null && to == null) {
      return true
    }

    const occurredAt = toTimestamp(resolveStudioExperienceDate(item))
    if (occurredAt == null) {
      return false
    }

    return (from == null || occurredAt >= from) && (to == null || occurredAt <= to)
  })
}

export const buildStudioConversionAnalytics = (
  applications: StudioApplicationSummary[],
  range: StudioResolvedDateRange,
  sources: StudioConversionSources
): StudioConversionAnalytics => {
  const cohort = selectConversionCohort(applications, range)
  const completedExperienceCount = cohort.length

  // 세는 단위는 Experience 다. 같은 체험이 여러 번 세어지지 않도록 id 로만 맞춘다.
  let publishedExperienceCount = 0
  let planned = 0
  let considering = 0
  let declined = 0
  let decisionTotal = 0
  let enrolled = 0
  let notEnrolled = 0
  let resultTotal = 0

  const matrix = new Map<ParentDecision, StudioConversionMatrixRow>(
    PARENT_DECISION_KEYS.map((decision) => [
      decision,
      { decision, enrolled: 0, notEnrolled: 0, resultPending: 0, total: 0 }
    ])
  )

  for (const experience of cohort) {
    if (sources.publishedReportExperienceIds.has(experience.id)) {
      publishedExperienceCount += 1
    }

    const decision = sources.parentDecisionByExperienceId.get(experience.id) ?? null
    const result = sources.registrationResultByExperienceId.get(experience.id) ?? null

    if (decision) {
      decisionTotal += 1
      if (decision === "planned") planned += 1
      if (decision === "considering") considering += 1
      if (decision === "declined") declined += 1
    }

    if (result) {
      resultTotal += 1
      if (result === "enrolled") enrolled += 1
      if (result === "not_enrolled") notEnrolled += 1
    }

    // matrix 는 부모가 실제로 무언가 남긴 체험만 본다.
    // 남기지 않은 것을 한 칸에 몰아넣으면 "말이 없었다" 가 하나의 의향처럼 읽힌다.
    if (decision) {
      const row = matrix.get(decision)
      if (row) {
        row.total += 1
        if (result === "enrolled") row.enrolled += 1
        else if (result === "not_enrolled") row.notEnrolled += 1
        else row.resultPending += 1
      }
    }
  }

  return {
    periodLabel: range.label,
    cohort: { completedExperienceCount },
    reports: {
      publishedExperienceCount,
      coverageRate: roundPercentage(publishedExperienceCount, completedExperienceCount)
    },
    parentDecisions: {
      total: decisionTotal,
      planned,
      considering,
      declined,
      notCollected: completedExperienceCount - decisionTotal
    },
    registrationResults: {
      total: resultTotal,
      enrolled,
      notEnrolled,
      unresolved: completedExperienceCount - resultTotal
    },
    rates: {
      overallEnrollmentRate: roundPercentage(enrolled, completedExperienceCount),
      overallNumerator: enrolled,
      overallDenominator: completedExperienceCount,
      resolvedEnrollmentRate: roundPercentage(enrolled, resultTotal),
      resolvedNumerator: enrolled,
      resolvedDenominator: resultTotal
    },
    decisionResultMatrix: PARENT_DECISION_KEYS.map(
      (decision) =>
        matrix.get(decision) ?? {
          decision,
          enrolled: 0,
          notEnrolled: 0,
          resultPending: 0,
          total: 0
        }
    ),
    decisionResultMatrixTotal: decisionTotal,
    hasCohort: completedExperienceCount > 0
  }
}

/** 분모가 0이면 0% 가 아니라 "—" 다. 0% 는 "아무도 등록하지 않았다" 는 뜻이 된다. */
export const formatConversionRate = (value: number | null): string =>
  value == null ? "—" : `${value.toFixed(1)}%`

/** "12 / 24" — 비율 옆에 분모를 항상 같이 적는다. */
export const formatRateFraction = (numerator: number, denominator: number): string =>
  `${numerator} / ${denominator}`

export const PARENT_DECISION_MATRIX_LABELS: Record<ParentDecision, string> = {
  planned: "등록할 생각이에요",
  considering: "조금 더 고민 중이에요",
  declined: "이번에는 등록하지 않을게요"
}

export const CONVERSION_MATRIX_COLUMN_LABELS: Record<StudioConversionMatrixColumn, string> = {
  enrolled: "등록",
  not_enrolled: "미등록",
  result_pending: "결과 미확정"
}
