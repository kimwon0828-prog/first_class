import { dataAdapter, dataAdapterType } from "@/shared/lib/db"
import type { AcademyArea } from "@/shared/config/academy-areas"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"

const shouldDebugDb = () => process.env.NEXT_PUBLIC_DEBUG_DB === "1"

const getSupabaseHost = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    return null
  }

  try {
    return new URL(url).host
  } catch {
    return "invalid"
  }
}

export const getPublicClasses = async (
  region: AcademyArea,
  options?: { subject?: string; query?: string }
): Promise<QueryResult<ClassSummary[]>> => {
  try {
    if (shouldDebugDb()) {
      console.info(
        `[classes-debug] ${JSON.stringify({
          supabaseHost: getSupabaseHost(),
          dataAdapter: dataAdapterType,
          region,
          subject: options?.subject ?? null,
          query: options?.query?.trim() ? options.query.trim() : null
        })}`
      )
    }

    const data = await dataAdapter.listClasses({
      region,
      subject: options?.subject,
      query: options?.query
    })
    if (shouldDebugDb()) {
      console.info(
        `[getPublicClasses] ${JSON.stringify({ region, returned: data.length })}`
      )
    }
    return { data, error: null }
  } catch {
    if (shouldDebugDb()) {
      console.error(`[getPublicClasses] ${JSON.stringify({ region, ok: false })}`)
    }
    return {
      data: [],
      error: "수업 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
