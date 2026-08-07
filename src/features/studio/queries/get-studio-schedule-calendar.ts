import { dataAdapter } from "@/shared/lib/db"
import type { StudioScheduleCalendarDay, StudioScheduleCalendarItem } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

type GetStudioScheduleCalendarInput = {
  organizationId: string
  month: string
  classId?: string | null
  teacherId?: string | null
}

export const getStudioScheduleCalendar = async (
  input: GetStudioScheduleCalendarInput
): Promise<QueryResult<{ items: StudioScheduleCalendarItem[]; days: StudioScheduleCalendarDay[] }>> => {
  try {
    const data = await dataAdapter.getStudioScheduleCalendar(input)
    return { data, error: null }
  } catch (error) {
    console.error("[getStudioScheduleCalendar failed]", {
      ...input,
      message: error instanceof Error ? error.message : "unknown_error"
    })
    return {
      data: { items: [], days: [] },
      error: "월간 예약 가능 일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
