/** Optional Home data must not take the discovery page down. */
export function logHomeEnhancementFailure(stage: string, error: unknown) {
  const detail = error as { code?: unknown; message?: unknown; stack?: unknown } | null
  console.error(`[parent-home:${stage}] enhancement unavailable`, {
    code: typeof detail?.code === "string" ? detail.code : "unknown",
    message: typeof detail?.message === "string" ? detail.message : "Optional Home query failed",
    stack: typeof detail?.stack === "string" ? detail.stack : undefined
  })
}

export async function settleHomeEnhancement<T>(stage: string, query: () => Promise<T>, unavailable: T): Promise<T> {
  try { return await query() }
  catch (error) { logHomeEnhancementFailure(stage, error); return unavailable }
}
