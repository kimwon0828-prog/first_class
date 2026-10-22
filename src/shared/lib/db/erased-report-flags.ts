import type { SupabaseClient } from "@supabase/supabase-js"

/** Preserves a publication count after private report content is erased. No old JSON. */
export async function readErasedReportFlags(client: SupabaseClient, ids: string[]): Promise<string[]> {
  const result = new Set<string>()
  for (let offset = 0; offset < ids.length; offset += 1000) {
    const batch = ids.slice(offset, offset + 1000)
    const response = await client.rpc("get_studio_erased_report_flags", { p_ids: batch })
    if (response.error) {
      if (response.error.code === "PGRST202"
        && String(response.error.message ?? "").includes("get_studio_erased_report_flags")) return []
      throw new Error("failed_to_fetch_erased_report_flags")
    }
    if (!Array.isArray(response.data)) throw new Error("invalid_erased_report_flags")
    for (const row of response.data) {
      if (!row || typeof row.application_id !== "string" || !batch.includes(row.application_id)) {
        throw new Error("invalid_erased_report_flags")
      }
      result.add(row.application_id)
    }
  }
  return [...result]
}
