import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { listAvailableScheduleSlotsByClassIdWithClient } from "@/shared/lib/db/supabase-adapter"
import type { AvailableScheduleSlot } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

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
      error: "예약 가능 시간대를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
