import { dataAdapter } from "@/shared/lib/db"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

export const getClassAvailableSlots = async (
  classId: string
): Promise<QueryResult<AvailableScheduleSlot[]>> => {
  try {
    const data = await dataAdapter.listAvailableScheduleSlotsByClassId(classId)
    return { data, error: null }
  } catch {
    return {
      data: [],
      error: "예약 가능 시간대를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
