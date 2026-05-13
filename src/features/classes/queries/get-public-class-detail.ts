import { dataAdapter } from "@/shared/lib/db"
import type { ClassDetail } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getPublicClassDetail = async (
  classId: string
): Promise<QueryResult<ClassDetail | null>> => {
  try {
    const data = await dataAdapter.getClassById(classId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      error: "수업 상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
