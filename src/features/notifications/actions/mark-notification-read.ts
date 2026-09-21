"use server"
import { revalidatePath } from "next/cache"
import { getParentAccessState } from "@/features/my/lib/require-parent-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

/** Best effort: auth/key/RLS failures must not prevent opening the destination. */
export async function markNotificationRead(notificationKey: string): Promise<boolean> {
  if (!/^(status|report_published):[0-9a-f-]{36}$/i.test(notificationKey)) return false
  try {
    const access = await getParentAccessState("/notifications")
    if (access.status !== "ok") return false
    const db = await getSupabaseServerClient()
    const { error } = await db.from("parent_notification_reads").upsert(
      { parent_id: access.profile.id, notification_key: notificationKey },
      { onConflict: "parent_id,notification_key", ignoreDuplicates: true }
    )
    if (error) {
      console.error("[parent-notifications:mark-read] write failed", { code: error.code, message: error.message })
      return false
    }
    revalidatePath("/notifications")
    revalidatePath("/")
    return true
  } catch { return false }
}
