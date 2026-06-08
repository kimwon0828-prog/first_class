import { dataAdapter } from "@/shared/lib/db"
import type { StudioTeacherOption } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioClassFormOptions = async (
  organizationId: string
): Promise<QueryResult<StudioTeacherOption[]>> => {
  try {
    const data = await dataAdapter.listStudioTeacherOptions(organizationId)
    return { data, error: null }
  } catch (error) {
    console.error("[getStudioClassFormOptions failed]", {
      organizationId,
      message: error instanceof Error ? error.message : "unknown_error"
    })
    return {
      data: [],
      error: "담당 선생님 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
