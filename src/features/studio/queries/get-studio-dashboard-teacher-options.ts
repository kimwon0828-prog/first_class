import { dataAdapter } from "@/shared/lib/db"
import type { StudioDashboardTeacherFilterOption } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioDashboardTeacherOptions = async (
  organizationId: string
): Promise<QueryResult<StudioDashboardTeacherFilterOption[]>> => {
  try {
    const data = await dataAdapter.listStudioDashboardTeacherFilterOptions(organizationId)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "선생님 필터 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
