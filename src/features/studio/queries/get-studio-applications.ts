import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioApplications = async (
  organizationId: string
): Promise<QueryResult<StudioApplicationSummary[]>> => {
  try {
    const data = await dataAdapter.listStudioApplications(organizationId)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "신청 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
