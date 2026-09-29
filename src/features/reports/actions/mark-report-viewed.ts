"use server"

import { getParentAccessState } from "@/features/my/lib/require-parent-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

// A separate POST, never called from a query, metadata or server page render.
export async function markReportViewed(reportId: string): Promise<boolean> {
  try {
    const access = await getParentAccessState("/record")
    if (access.status !== "ok") return false
    const db = await getSupabaseServerClient()
    const { error } = await db.rpc("mark_parent_report_viewed", { p_report_id: reportId })
    return !error
  } catch { return false }
}
