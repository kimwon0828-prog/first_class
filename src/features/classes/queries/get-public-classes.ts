import "server-only"

import type { AcademyArea } from "@/shared/config/academy-areas"
import type { ClassSummary } from "@/shared/lib/db/adapter"
import type { QueryResult } from "@/shared/queries"
import { listPublicClassesWithSafeProjection } from "@/features/classes/queries/public-class-safe-projection"

const shouldDebugDb = () => process.env.NEXT_PUBLIC_DEBUG_DB === "1"
const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)
const publicClassDataSource =
  process.env.NEXT_PUBLIC_DATA_SOURCE ?? (hasSupabaseEnv ? "supabase" : "mock")

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
  region: AcademyArea | null,
  options?: { subject?: string; query?: string }
): Promise<QueryResult<ClassSummary[]>> => {
  try {
    if (shouldDebugDb()) {
      console.info(
        `[classes-debug] ${JSON.stringify({
          supabaseHost: getSupabaseHost(),
          dataAdapter: publicClassDataSource,
          region,
          subject: options?.subject ?? null,
          query: options?.query?.trim() ? options.query.trim() : null
        })}`
      )
    }

    const data =
      region === null
        ? publicClassDataSource === "supabase"
          ? await listPublicClassesWithSafeProjection({
              subject: options?.subject,
              query: options?.query
            })
          : await (await import("@/shared/lib/db")).dataAdapter.listClasses({
              subject: options?.subject,
              query: options?.query
            })
        : publicClassDataSource === "supabase"
          ? await listPublicClassesWithSafeProjection({
              region,
              subject: options?.subject,
              query: options?.query
            })
          : await (await import("@/shared/lib/db")).dataAdapter.listClasses({
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

export const getAllPublicClasses = async (options?: {
  subject?: string
  query?: string
}): Promise<QueryResult<ClassSummary[]>> => {
  try {
    if (shouldDebugDb()) {
      console.info(
        `[classes-debug] ${JSON.stringify({
          supabaseHost: getSupabaseHost(),
          dataAdapter: publicClassDataSource,
          region: null,
          subject: options?.subject ?? null,
          query: options?.query?.trim() ? options.query.trim() : null
        })}`
      )
    }

    const data =
      publicClassDataSource === "supabase"
        ? await listPublicClassesWithSafeProjection({
            subject: options?.subject,
            query: options?.query
          })
        : await (await import("@/shared/lib/db")).dataAdapter.listClasses({
            subject: options?.subject,
            query: options?.query
          })

    if (shouldDebugDb()) {
      console.info(`[getAllPublicClasses] ${JSON.stringify({ returned: data.length })}`)
    }

    return { data, error: null }
  } catch {
    if (shouldDebugDb()) {
      console.error(`[getAllPublicClasses] ${JSON.stringify({ ok: false })}`)
    }

    return {
      data: [],
      error: "수업 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
    }
  }
}
