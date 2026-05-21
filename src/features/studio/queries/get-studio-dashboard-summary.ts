import { dataAdapter } from "@/shared/lib/db"
import type { StudioDashboardSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

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

    return {
      data: {
        newApplicationCount: applications.filter((item) => item.status === "new").length,
        activeApplicationCount: applications.filter((item) =>
          item.status === "reviewing" || item.status === "confirmed"
        ).length,
        myClassCount: classes.filter((item) => item.teacherId === teacherId).length,
        availableSlotCount: scheduleBlocks.filter((item) => item.type === "available").length
      },
      error: null
    }
  } catch {
    return {
      data: {
        newApplicationCount: 0,
        activeApplicationCount: 0,
        myClassCount: 0,
        availableSlotCount: 0
      },
      error: "대시보드 요약 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
