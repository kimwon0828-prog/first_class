import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { listAvailableScheduleSlotsByClassIdWithClient, listAvailableScheduleSlotsByClassIdsWithClient } from "@/shared/lib/db/supabase-adapter"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

const SLOTS_UNAVAILABLE = "예약 가능 시간대를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."

export const getPublicClassAvailableSlots = async (
  classId: string
): Promise<QueryResult<AvailableScheduleSlot[]>> => {
  try {
    const supabase = getSupabaseServiceRoleClient()
    const data = await listAvailableScheduleSlotsByClassIdWithClient({
      classId,
      supabase
    })

    return { data, error: null }
  } catch (error) {
    console.error("[public-class-slots]", {
      classId,
      message: error instanceof Error ? error.message : "unknown_error"
    })
    return {
      data: [],
      error: SLOTS_UNAVAILABLE
    }
  }
}

// 여러 수업의 공개 일정을 한 번에(목록·카드용). 수업마다 getPublicClassAvailableSlots와 같은 결과·같은 오류 문구를 돌려준다.
export const getPublicClassesAvailableSlots = async (
  classIds: readonly string[]
): Promise<Map<string, QueryResult<AvailableScheduleSlot[]>>> => {
  try {
    const grouped = await listAvailableScheduleSlotsByClassIdsWithClient({ classIds, supabase: getSupabaseServiceRoleClient() })
    return new Map(classIds.map((classId) => {
      const slots = grouped.get(classId)
      return [classId, slots && !slots.error ? { data: slots.data, error: null } : { data: [], error: SLOTS_UNAVAILABLE }]
    }))
  } catch (error) {
    console.error("[public-class-slots]", {
      classCount: classIds.length,
      message: error instanceof Error ? error.message : "unknown_error"
    })
    return new Map(classIds.map((classId) => [classId, { data: [], error: SLOTS_UNAVAILABLE }]))
  }
}
