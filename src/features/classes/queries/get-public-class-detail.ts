import "server-only"

import { getPublicClassDetailWithSafeProjection } from "@/features/classes/queries/public-class-safe-projection"
import type { ClassDetail } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)
const publicClassDataSource =
  process.env.NEXT_PUBLIC_DATA_SOURCE ?? (hasSupabaseEnv ? "supabase" : "mock")

export const getPublicClassDetail = async (
  classId: string
): Promise<QueryResult<ClassDetail | null>> => {
  try {
    const data =
      publicClassDataSource === "supabase"
        ? await getPublicClassDetailWithSafeProjection(classId)
        : await (await import("@/shared/lib/db")).dataAdapter.getClassById(classId)
    return { data, error: null }
  } catch {
    return {
      data: null,
      error: "수업 상세 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
