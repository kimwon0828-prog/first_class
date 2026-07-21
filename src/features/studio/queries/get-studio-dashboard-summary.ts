import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationSummary, StudioDashboardSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

const getStartOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const getEndOfToday = () => {
  const start = getStartOfToday()
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return end
}

const isWithinRange = (value: string | null, start: Date, end: Date) => {
  if (!value) {
    return false
  }

  const date = new Date(value)
  return date >= start && date < end
}

const getScheduledAt = (application: StudioApplicationSummary) =>
  application.confirmedSlotAt ?? application.requestedSlotAt

const toEnrollmentRate = (enrolledCount: number, applicationCount: number) => {
  if (applicationCount <= 0) {
    return 0
  }

  return Math.round((enrolledCount / applicationCount) * 100)
}

export const buildStudioDashboardSummary = (
  applications: StudioApplicationSummary[]
): StudioDashboardSummary => {
  const todayStart = getStartOfToday()
  const todayEnd = getEndOfToday()
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthEnd = new Date(monthStart)
  monthEnd.setMonth(monthEnd.getMonth() + 1)

  const eligibleApplications = applications.filter((item) => item.status !== "canceled")
  const enrolledCount = eligibleApplications.filter(
    (item) => item.registrationStatus === "enrolled"
  ).length

  const monthlyApplications = eligibleApplications.filter((item) =>
    isWithinRange(item.createdAt, monthStart, monthEnd)
  )
  const monthlyCompletedCount = eligibleApplications.filter(
    (item) => item.status === "completed" && isWithinRange(item.updatedAt, monthStart, monthEnd)
  ).length
  const monthlyEnrolledCount = eligibleApplications.filter(
    (item) =>
      item.registrationStatus === "enrolled" &&
      isWithinRange(item.updatedAt, monthStart, monthEnd)
  ).length

  return {
    newApplicationCount: applications.filter((item) => item.status === "new").length,
    activeApplicationCount: applications.filter(
      (item) => item.status === "reviewing" || item.status === "confirmed"
    ).length,
    todayScheduledCount: applications.filter(
      (item) => item.status !== "canceled" && isWithinRange(getScheduledAt(item), todayStart, todayEnd)
    ).length,
    pendingConfirmationCount: applications.filter(
      (item) => item.status === "new" || item.status === "reviewing"
    ).length,
    needsOutcomeCount: applications.filter(
      (item) =>
        item.status === "completed" &&
        (item.registrationStatus === "undecided" || item.registrationStatus === "pending")
    ).length,
    registeredCount: enrolledCount,
    enrollmentRate: toEnrollmentRate(enrolledCount, eligibleApplications.length),
    monthlyApplicationCount: monthlyApplications.length,
    monthlyCompletedCount,
    monthlyEnrolledCount,
    monthlyEnrollmentRate: toEnrollmentRate(monthlyEnrolledCount, monthlyApplications.length)
  }
}

export const getStudioDashboardSummary = async (
  organizationId: string,
  options?: { teacherId?: string | null }
): Promise<QueryResult<StudioDashboardSummary>> => {
  try {
    const applications = await dataAdapter.listStudioApplications(organizationId, {
      teacherId: options?.teacherId ?? null
    })

    return {
      data: buildStudioDashboardSummary(applications),
      error: null
    }
  } catch {
    return {
      data: {
        newApplicationCount: 0,
        activeApplicationCount: 0,
        todayScheduledCount: 0,
        pendingConfirmationCount: 0,
        needsOutcomeCount: 0,
        registeredCount: 0,
        enrollmentRate: 0,
        monthlyApplicationCount: 0,
        monthlyCompletedCount: 0,
        monthlyEnrolledCount: 0,
        monthlyEnrollmentRate: 0
      },
      error: "대시보드 요약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
