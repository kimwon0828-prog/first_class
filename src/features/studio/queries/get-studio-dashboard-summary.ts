import { dataAdapter } from "@/shared/lib/db"
import type {
  StudioApplicationListOptions,
  StudioApplicationSummary,
  StudioDashboardSummary
} from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

const createEmptySummary = (): StudioDashboardSummary => ({
  actionableCount: 0,
  totalApplicationCount: 0,
  newApplicationCount: 0,
  needsRegistrationConfirmationCount: 0,
  confirmedCount: 0,
  canceledOrNoShowCount: 0,
  registeredCount: 0,
  completedCount: 0,
  enrollmentRate: null,
  enrollmentRateNumerator: 0,
  enrollmentRateDenominator: 0
})

export const buildStudioDashboardSummary = (
  applications: StudioApplicationSummary[]
): StudioDashboardSummary => {
  const totalApplicationCount = applications.length
  const newApplicationCount = applications.filter((item) => item.status === "new").length
  const needsRegistrationConfirmationCount = applications.filter((item) => {
    if (item.status !== "completed") {
      return false
    }

    return (
      item.registrationStatus == null ||
      item.registrationStatus === "undecided" ||
      item.registrationStatus === "pending"
    )
  }).length
  const confirmedCount = applications.filter((item) => item.status === "confirmed").length
  const canceledOrNoShowCount = applications.filter((item) => item.status === "canceled").length
  const registeredCount = applications.filter((item) => item.registrationStatus === "enrolled").length
  const completedCount = applications.filter((item) => item.status === "completed").length
  // TODO: `enrolled_at`가 도입되면 등록 전환율 기간 집계를 등록 시점 기준으로 전환한다.
  const enrollmentRateNumerator = applications.filter(
    (item) => item.status === "completed" && item.registrationStatus === "enrolled"
  ).length
  const enrollmentRateDenominator = completedCount
  const enrollmentRate =
    enrollmentRateDenominator > 0
      ? Math.round((enrollmentRateNumerator / enrollmentRateDenominator) * 100)
      : null

  return {
    actionableCount: newApplicationCount + needsRegistrationConfirmationCount,
    totalApplicationCount,
    newApplicationCount,
    needsRegistrationConfirmationCount,
    confirmedCount,
    canceledOrNoShowCount,
    registeredCount,
    completedCount,
    enrollmentRate,
    enrollmentRateNumerator,
    enrollmentRateDenominator
  }
}

export const getStudioDashboardSummary = async (
  organizationId: string,
  options?: StudioApplicationListOptions
): Promise<QueryResult<StudioDashboardSummary>> => {
  try {
    const applications = await dataAdapter.listStudioApplications(organizationId, options)

    return {
      data: buildStudioDashboardSummary(applications),
      error: null
    }
  } catch {
    return {
      data: createEmptySummary(),
      error: "대시보드 요약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
