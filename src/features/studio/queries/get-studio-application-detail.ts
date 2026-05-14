import { dataAdapter } from "@/shared/lib/db"
import type { StudioApplicationDetail } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioApplicationDetail = async (
  applicationId: string,
  organizationId: string
): Promise<QueryResult<StudioApplicationDetail | null>> => {
  try {
    const data = await dataAdapter.getStudioApplicationDetail(applicationId, organizationId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      error: "신청 상세를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
