import { dataAdapter } from "@/shared/lib/db"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioClasses = async (
  organizationId: string
): Promise<QueryResult<ClassSummary[]>> => {
  try {
    const data = await dataAdapter.listStudioClasses(organizationId)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "수업 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
