import { dataAdapter } from "@/shared/lib/db"
import type { AcademyArea } from "@/shared/config/academy-areas"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getPublicClasses = async (
  region: AcademyArea
): Promise<QueryResult<ClassSummary[]>> => {
  try {
    const data = await dataAdapter.listClasses({ region })
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "수업 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
