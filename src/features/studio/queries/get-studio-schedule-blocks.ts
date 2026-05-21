import { dataAdapter } from "@/shared/lib/db"
import type { StudioScheduleBlockSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getStudioScheduleBlocks = async (
  teacherId: string
): Promise<QueryResult<StudioScheduleBlockSummary[]>> => {
  try {
    const data = await dataAdapter.listTeacherScheduleBlocks(teacherId)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "일정 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
