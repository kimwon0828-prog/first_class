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

const getStartOfWeek = () => {
  const today = getStartOfToday()
  const day = today.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const start = new Date(today)
  start.setDate(today.getDate() + diff)
  return start
}

const getEndOfWeek = () => {
  const start = getStartOfWeek()
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
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

export const getStudioDashboardSummary = async (
  organizationId: string,
  teacherId: string
): Promise<QueryResult<StudioDashboardSummary>> => {
  try {
    const [applications, classes, scheduleBlocks] = await Promise.all([
      dataAdapter.listStudioApplications(organizationId),
      dataAdapter.listStudioClasses(organizationId),
      dataAdapter.listTeacherScheduleBlocks(teacherId)
    ])

    const todayStart = getStartOfToday()
    const todayEnd = getEndOfToday()
    const weekStart = getStartOfWeek()
    const weekEnd = getEndOfWeek()

    const weeklyApplications = applications.filter((item) =>
      isWithinRange(item.createdAt, weekStart, weekEnd)
    )
    const weeklyConfirmedCount = weeklyApplications.filter(
      (item) => item.status === "confirmed" || item.status === "completed"
    ).length
    const weeklyCompletedCount = weeklyApplications.filter((item) => item.status === "completed").length
    const weeklyEnrolledCount = weeklyApplications.filter(
      (item) => item.registrationStatus === "enrolled"
    ).length
    const weeklyRegisteredCount = applications.filter(
      (item) =>
        item.registrationStatus === "enrolled" && isWithinRange(item.updatedAt, weekStart, weekEnd)
    ).length

    return {
      data: {
        newApplicationCount: applications.filter((item) => item.status === "new").length,
        activeApplicationCount: applications.filter((item) =>
          item.status === "reviewing" || item.status === "confirmed"
        ).length,
        myClassCount: classes.filter((item) => item.teacherId === teacherId).length,
        availableSlotCount: scheduleBlocks.filter((item) => item.type === "available").length,
        todayScheduledCount: applications.filter(
          (item) =>
            item.status !== "canceled" &&
            isWithinRange(getScheduledAt(item), todayStart, todayEnd)
        ).length,
        pendingConfirmationCount: applications.filter(
          (item) => item.status === "new" || item.status === "reviewing"
        ).length,
        needsOutcomeCount: applications.filter(
          (item) =>
            item.status === "completed" &&
            (item.registrationStatus === "undecided" || item.registrationStatus === "pending")
        ).length,
        weeklyRegisteredCount,
        weeklyApplicationCount: weeklyApplications.length,
        weeklyConfirmedCount,
        weeklyCompletedCount,
        weeklyEnrolledCount,
        weeklyEnrollmentRate: toEnrollmentRate(weeklyEnrolledCount, weeklyApplications.length)
      },
      error: null
    }
  } catch {
    return {
      data: {
        newApplicationCount: 0,
        activeApplicationCount: 0,
        myClassCount: 0,
        availableSlotCount: 0,
        todayScheduledCount: 0,
        pendingConfirmationCount: 0,
        needsOutcomeCount: 0,
        weeklyRegisteredCount: 0,
        weeklyApplicationCount: 0,
        weeklyConfirmedCount: 0,
        weeklyCompletedCount: 0,
        weeklyEnrolledCount: 0,
        weeklyEnrollmentRate: 0
      },
      error: "대시보드 요약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
