// 분석 화면(Figma 2148:6580)의 표시 모델.
//
// 새 계산식을 만들지 않는다. 숫자는 buildStudioDashboardMetrics(신청일 cohort)에서 오고,
// 전환율은 computeTrialEnrollmentRate(등록 ÷ 체험 완료) 하나만 쓴다.
// 이미 읽어 둔 신청 목록 위의 계산이라 조회가 늘지 않는다(직전 기간 비교도 같은 목록).
//
//   카드 4개   신청 · 체험 완료(신청의 N%) · 등록(체험한 학생의 N% · 결과 대기) · 불참(확정의 N%)
//   흐름 4단   신청 · 일정 확정 · 체험 완료 · 등록 — "이전 단계의 N%", 가장 크게 줄어든 단계 문장
//   이유       미등록 사유(새 목록, 옛 값은 매핑) · "시간" 사유의 희망 요일 문장
//   수업별     신청 · 체험 · 등록 · 전환율, 신청 많은 순

import {
  getNotEnrolledReasonLabel,
  NOT_ENROLLED_REASONS,
  NOT_ENROLLED_REASON_ORDER,
  resolveNotEnrolledReasonIds
} from "@/features/registration/lib/registration-input"
import { getCaseStage } from "@/features/studio/lib/case-view-model"
import {
  buildStudioDashboardMetrics,
  computeTrialEnrollmentRate,
  formatEnrollmentRate,
  isCreatedWithinRange,
  type StudioDashboardMetrics
} from "@/features/studio/lib/studio-dashboard-metrics"
import {
  getStudioDateRangeEndIso,
  getStudioDateRangeStartIso,
  type StudioResolvedDateRange
} from "@/features/studio/lib/studio-date-range"
import { countTopPreferredDay, resolvePreferredDays } from "@/features/students/lib/preferred-days"
import type { StudioApplicationSummary, StudioCurrentParentDecision } from "@/shared/lib/db/adapter"

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 정수 % (분모 0 이면 null) — 화면의 모든 비율 표기 */
const percent = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? Math.round((numerator / denominator) * 100) : null

const percentText = (value: number | null) => (value == null ? "—" : `${value}%`)

// ─────────────────────────────────────────────────────────────
// 비교 기간
// ─────────────────────────────────────────────────────────────

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** 그 달의 1일(UTC 자정 ms). monthOffset 만큼 앞뒤 달로 옮긴다. */
const monthStartMs = (dateKey: string, monthOffset: number) =>
  Date.UTC(Number(dateKey.slice(0, 4)), Number(dateKey.slice(5, 7)) - 1 + monthOffset, 1)

/**
 * 비교할 기간(KST 날짜). 전체 기간이면 null.
 *   이번 달 칩  지난달 1일 ~ 같은 날짜(지난달에 그 날이 없으면 말일). 예: 10월 1~24일 → 9월 1~24일.
 *   지난달 칩  전전달 전체. 예: 9월 → 8월 1~31일.
 *   그 밖      바로 앞의 같은 길이 기간. 예: 10월 5~11일 → 9월 28일~10월 4일.
 */
export const resolvePreviousStudioDateRange = (range: StudioResolvedDateRange): StudioResolvedDateRange | null => {
  if (!range.startDate || !range.endDate) return null
  const start = Date.parse(`${range.startDate}T00:00:00Z`)
  const end = Date.parse(`${range.endDate}T00:00:00Z`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  let previousStart: string
  let previousEnd: string
  if (range.preset === "thisMonth" || range.preset === "lastMonth") {
    const from = monthStartMs(range.startDate, -1)
    const lastDay = monthStartMs(range.startDate, 0) - DAY_MS
    previousStart = ymd(from)
    previousEnd = range.preset === "thisMonth"
      ? ymd(Math.min(from + (Number(range.endDate.slice(8, 10)) - 1) * DAY_MS, lastDay))
      : ymd(lastDay)
  } else {
    const lengthDays = Math.round((end - start) / DAY_MS) + 1
    previousEnd = ymd(start - DAY_MS)
    previousStart = ymd(start - lengthDays * DAY_MS)
  }
  return {
    preset: "custom",
    startDate: previousStart,
    endDate: previousEnd,
    createdAtFrom: getStudioDateRangeStartIso(previousStart),
    createdAtTo: getStudioDateRangeEndIso(previousEnd),
    label: `${previousStart} ~ ${previousEnd}`
  }
}

/** "9월보다" / "직전 같은 기간보다" — 이번 달 · 지난달이면 직전 기간이 끝나는 달 이름을 쓴다. */
const previousLabel = (range: StudioResolvedDateRange, previous: StudioResolvedDateRange) => {
  if ((range.preset === "thisMonth" || range.preset === "lastMonth") && previous.endDate) {
    const month = Number(previous.endDate.slice(5, 7))
    return { than: `${month}월보다`, same: `${month}월과` }
  }
  return { than: "직전 같은 기간보다", same: "직전 같은 기간과" }
}

// ─────────────────────────────────────────────────────────────
// 모델
// ─────────────────────────────────────────────────────────────

export type StudioAnalyticsCard = {
  key: "application" | "completed" | "enrolled" | "no_show"
  label: string
  value: string
  caption: string | null
  /** 등록 카드의 "결과 대기 N명" */
  sub: string | null
  tone: "neutral" | "brand"
}

export type StudioAnalyticsFlowStep = {
  key: "application" | "confirmed" | "completed" | "enrolled"
  label: string
  count: number
  /** 신청 대비 막대 길이(0~100) */
  widthPercent: number
  /** "이전 단계의 N%" — 첫 단계는 null */
  fromPrevious: string | null
  /** 가장 크게 줄어든 단계 */
  biggestDrop: boolean
  /** 등록 막대만 초록 */
  tone: "neutral" | "brand"
}

export type StudioAnalyticsReason = {
  key: string
  label: string
  count: number
  widthPercent: number
  top: boolean
}

export type StudioAnalyticsClassRow = {
  classId: string
  title: string
  categoryCode: string | null
  applicationCount: number
  completedCount: number
  enrolledCount: number
  /** 등록 ÷ 체험 완료(정수 %) — 체험 완료가 0 이면 null */
  rate: number | null
  rateText: string
}

export type StudioAnalyticsView = {
  periodLabel: string
  hasCohort: boolean
  cards: StudioAnalyticsCard[]
  flow: StudioAnalyticsFlowStep[]
  /** 흐름 아래 안내. 신청이 없으면 null. */
  insight: { text: string; showStudents: boolean } | null
  reasons: StudioAnalyticsReason[]
  /** "'희망 시간 불일치' 5명 중 4명이 토요일을 원했어요." — 희망 요일 기록이 없으면 null */
  reasonDayNote: string | null
  classRows: StudioAnalyticsClassRow[]
  metrics: StudioDashboardMetrics
}

const DROP_SENTENCE: Record<"confirmed" | "completed" | "enrolled", string> = {
  confirmed: "신청 후 일정 확정까지가 가장 크게 줄어요.",
  completed: "일정 확정 후 체험 완료까지가 가장 크게 줄어요.",
  enrolled: "체험 후 등록까지가 가장 크게 줄어요."
}

const SCHEDULE_REASON = "schedule_mismatch"

export const buildStudioAnalyticsView = (input: {
  applications: StudioApplicationSummary[]
  range: StudioResolvedDateRange
  /** 다시 연락할 학생 수(학생 단위, 미등록 + 고민 중 — 학생 탭 · 홈과 같은 buildRecontactStudents) */
  recontactCount: number
  /** 학부모가 남긴 지금 유효한 의향(희망 요일). "희망 시간 불일치" 요일 문장이 상담 기록보다 먼저 쓴다. */
  decisions?: ReadonlyArray<StudioCurrentParentDecision>
  now?: Date
}): StudioAnalyticsView => {
  const now = input.now ?? new Date()
  const metrics = buildStudioDashboardMetrics(input.applications, input.range, now)
  const previous = resolvePreviousStudioDateRange(input.range)
  const previousMetrics = previous ? buildStudioDashboardMetrics(input.applications, previous, now) : null

  const applicationCount = metrics.steps[0]?.count ?? 0
  const confirmedCount = metrics.confirmedCount
  const completedCount = metrics.completedCount
  const enrolledCount = metrics.enrolledCount
  const noShowCount = metrics.trialOutcomes.noShow

  // ── 카드 ──────────────────────────────────────────────
  let applicationCaption: string | null = null
  if (previous && previousMetrics) {
    const labels = previousLabel(input.range, previous)
    const diff = applicationCount - (previousMetrics.steps[0]?.count ?? 0)
    applicationCaption =
      diff > 0 ? `${labels.than} ${diff}명 늘었어요` : diff < 0 ? `${labels.than} ${-diff}명 줄었어요` : `${labels.same} 같아요`
  }

  const cards: StudioAnalyticsCard[] = [
    { key: "application", label: "신청", value: `${applicationCount}명`, caption: applicationCaption, sub: null, tone: "neutral" },
    {
      key: "completed",
      label: "체험 완료",
      value: `${completedCount}명`,
      caption: `신청의 ${percentText(percent(completedCount, applicationCount))}`,
      sub: null,
      tone: "neutral"
    },
    {
      key: "enrolled",
      label: "등록",
      value: `${enrolledCount}명`,
      caption: `체험한 학생의 ${formatEnrollmentRate(metrics.registrationConversionRate)}`,
      sub: metrics.pendingDecisionCount > 0 ? `결과 대기 ${metrics.pendingDecisionCount}명` : null,
      tone: "brand"
    },
    {
      key: "no_show",
      label: "불참",
      value: `${noShowCount}명`,
      // 불참한 학생도 일정이 확정됐던 학생이다. 확정 단계 수(불참 제외)에 불참을 더한 것이 분모다.
      caption: `확정의 ${percentText(percent(noShowCount, confirmedCount + noShowCount))}`,
      sub: null,
      tone: "neutral"
    }
  ]

  // ── 흐름 ──────────────────────────────────────────────
  const flowInput = [
    { key: "application" as const, label: "신청", count: applicationCount, previous: null as number | null },
    { key: "confirmed" as const, label: "일정 확정", count: confirmedCount, previous: applicationCount },
    { key: "completed" as const, label: "체험 완료", count: completedCount, previous: confirmedCount },
    // 등록 ÷ 체험 완료 — 등록 카드 · 홈 카드와 같은 정의(computeTrialEnrollmentRate)
    { key: "enrolled" as const, label: "등록", count: enrolledCount, previous: completedCount }
  ]
  const ratios = flowInput.map((step) =>
    step.key === "enrolled"
      ? computeTrialEnrollmentRate(step.count, completedCount)
      : step.previous == null
        ? null
        : percent(step.count, step.previous)
  )
  // 가장 크게 줄어든 단계: 이전 단계 대비 비율이 가장 낮은 단계(같으면 뒤 단계)
  let dropIndex = -1
  ratios.forEach((ratio, index) => {
    if (index === 0 || ratio == null) return
    if (dropIndex === -1 || Math.round(ratio) <= Math.round(ratios[dropIndex] as number)) dropIndex = index
  })

  const flow: StudioAnalyticsFlowStep[] = flowInput.map((step, index) => ({
    key: step.key,
    label: step.label,
    count: step.count,
    widthPercent: applicationCount > 0 ? Math.round((step.count / applicationCount) * 1000) / 10 : 0,
    fromPrevious: index === 0 ? null : `이전 단계의 ${ratios[index] == null ? "—" : `${Math.round(ratios[index] as number)}%`}`,
    biggestDrop: index === dropIndex,
    tone: step.key === "enrolled" ? "brand" : "neutral"
  }))

  let insight: StudioAnalyticsView["insight"] = null
  if (applicationCount > 0) {
    const dropKey = dropIndex > 0 ? (flowInput[dropIndex].key as keyof typeof DROP_SENTENCE) : null
    const parts = [dropKey ? DROP_SENTENCE[dropKey] : null, input.recontactCount > 0 ? `다시 연락할 학생이 ${input.recontactCount}명 있어요.` : null].filter(
      (part): part is string => Boolean(part)
    )
    insight = parts.length ? { text: parts.join(" "), showStudents: input.recontactCount > 0 } : null
  }

  // ── 등록하지 않은 이유 ──────────────────────────────────
  const cohort = input.applications.filter((item) => isCreatedWithinRange(item, input.range))
  const notEnrolled = cohort.filter(
    (item) => getCaseStage({ status: item.status, noShowAt: item.noShowAt, registrationStatus: item.registrationStatus ?? "undecided" }) === "not_enrolled"
  )
  const maxReason = Math.max(0, ...metrics.unregisteredReasonCounts.map((item) => item.count))
  const reasons: StudioAnalyticsReason[] = metrics.unregisteredReasonCounts
    .map((item) => ({
      key: item.reason ?? "unrecorded",
      label: item.reason ? getNotEnrolledReasonLabel(item.reason) ?? "기타" : "사유 기록 없음",
      count: item.count,
      order: item.reason ? NOT_ENROLLED_REASON_ORDER.get(item.reason) ?? NOT_ENROLLED_REASONS.length : Number.MAX_SAFE_INTEGER
    }))
    .sort((left, right) => right.count - left.count || left.order - right.order)
    .map((item, index) => ({
      key: item.key,
      label: item.label,
      count: item.count,
      widthPercent: maxReason > 0 ? Math.round((item.count / maxReason) * 1000) / 10 : 0,
      top: index === 0 && item.key !== "unrecorded"
    }))

  // "희망 시간 불일치" 학생이 원하는 요일 중 가장 많은 요일(같으면 월→일).
  // 요일은 학생 상세 · 홈과 같은 함수(resolvePreferredDays): 학부모 희망 요일 먼저, 없으면 상담 기록.
  let reasonDayNote: string | null = null
  const scheduleStudents = notEnrolled.filter((item) => resolveNotEnrolledReasonIds(item).includes(SCHEDULE_REASON))
  if (scheduleStudents.length > 0) {
    const daysById = new Map((input.decisions ?? []).map((item) => [item.applicationId, item.preferredDays]))
    const top = countTopPreferredDay(scheduleStudents.map((item) => resolvePreferredDays({
      decisionDays: daysById.get(item.id) ?? null,
      regularSchedulePreferences: [item.regularSchedulePreference]
    })?.days))
    if (top) {
      const label = getNotEnrolledReasonLabel(SCHEDULE_REASON)
      reasonDayNote = `"${label}" ${scheduleStudents.length}명 중 ${top.count}명이 ${top.label}요일을 원했어요.`
    }
  }

  // ── 수업별 전환 ─────────────────────────────────────────
  const byClass = new Map<string, StudioAnalyticsClassRow>()
  for (const item of cohort) {
    const stage = getCaseStage({ status: item.status, noShowAt: item.noShowAt, registrationStatus: item.registrationStatus ?? "undecided" })
    const row =
      byClass.get(item.classId) ??
      ({
        classId: item.classId,
        title: item.classTitle?.trim() || "수업",
        categoryCode: item.classSubjectCategory ?? null,
        applicationCount: 0,
        completedCount: 0,
        enrolledCount: 0,
        rate: null,
        rateText: "—"
      } satisfies StudioAnalyticsClassRow)
    row.applicationCount += 1
    // 체험 완료 = 체험을 마친 학생(등록 · 미등록 · 결과 대기 모두). 흐름의 "체험 완료"와 같은 기준이다.
    if (stage === "completed" || stage === "enrolled" || stage === "not_enrolled") row.completedCount += 1
    if (stage === "enrolled") row.enrolledCount += 1
    byClass.set(item.classId, row)
  }
  const classRows = Array.from(byClass.values())
    .map((row) => {
      const rate = computeTrialEnrollmentRate(row.enrolledCount, row.completedCount)
      return { ...row, rate: rate == null ? null : Math.round(rate), rateText: formatEnrollmentRate(rate) }
    })
    .sort((left, right) => right.applicationCount - left.applicationCount || left.title.localeCompare(right.title, "ko"))

  return {
    periodLabel: metrics.periodLabel,
    hasCohort: applicationCount > 0,
    cards,
    flow,
    insight,
    reasons,
    reasonDayNote,
    classRows,
    metrics
  }
}

/** 기간 칩 이름: 이번 달 → "10월", 지난달 → "9월" (Figma 2148:6588) */
export const resolveAnalyticsMonthLabels = (now: Date = new Date()) => {
  const kst = new Date(now.getTime() + KST_OFFSET_MS)
  const month = kst.getUTCMonth() + 1
  return { thisMonth: `${month}월`, lastMonth: `${month === 1 ? 12 : month - 1}월` }
}
