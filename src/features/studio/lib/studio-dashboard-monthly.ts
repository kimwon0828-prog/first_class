// 홈 "이번 달 등록 전환" 카드(Figma 2148:5081)의 최근 6개월 값.
//
// 새 계산식을 만들지 않는다. 기존 buildStudioDashboardMetrics 를 달마다(신청일 cohort) 한 번씩 부를 뿐이다.
// 등록 전환율 = 등록 ÷ (등록 + 미등록) 도 그 함수의 registrationConversionRate 그대로다.
// 이미 읽어 둔 신청 목록 위의 계산이라 조회가 늘지 않는다.

import { buildStudioDashboardMetrics } from "./studio-dashboard-metrics"
import { resolveStudioDateRange } from "./studio-date-range"
import { getSeoulTodayKey } from "./studio-schedule-month"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"

export type StudioMonthlyConversion = {
  month: number
  /** 등록 ÷ (등록 + 미등록). 결과가 나온 학생이 없으면 null. */
  rate: number | null
  enrolledCount: number
  decidedCount: number
  current: boolean
}

const pad = (value: number) => String(value).padStart(2, "0")

export const buildStudioMonthlyConversion = (
  applications: StudioApplicationSummary[],
  now: Date = new Date(),
  months = 6
): StudioMonthlyConversion[] => {
  const [yearText, monthText] = getSeoulTodayKey(now).split("-")
  const year = Number(yearText), month = Number(monthText)
  return Array.from({ length: months }, (_, index) => {
    const offset = months - 1 - index
    const first = new Date(Date.UTC(year, month - 1 - offset, 1))
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0))
    // 이번 달은 기존 "이번 달" 기간(preset) 그대로, 지난 달들은 그 달 1일 ~ 말일.
    const range = offset === 0
      ? resolveStudioDateRange({ preset: "thisMonth" })
      : resolveStudioDateRange({
        startDate: `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-01`,
        endDate: `${last.getUTCFullYear()}-${pad(last.getUTCMonth() + 1)}-${pad(last.getUTCDate())}`
      })
    const metrics = buildStudioDashboardMetrics(applications, range)
    return {
      month: first.getUTCMonth() + 1,
      rate: metrics.registrationConversionRate,
      enrolledCount: metrics.enrolledCount,
      decidedCount: metrics.decidedCount,
      current: offset === 0
    }
  })
}
