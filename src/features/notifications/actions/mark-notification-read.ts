"use server"
import { saveParentNotificationRead } from "../lib/save-parent-notification-read"
import { revalidatePath } from "next/cache"
import { getParentAccessState } from "@/features/my/lib/require-parent-access"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

/** Best effort: auth/key/RLS failures must not prevent opening the destination. */
export async function markNotificationRead(notificationKey: string): Promise<boolean> {
  if (!/^(status|report_published|feedback_reminder):[0-9a-f-]{36}$/i.test(notificationKey)) return false
  try {
    const access = await getParentAccessState("/notifications")
    if (access.status !== "ok") return false
    const db = await getSupabaseServerClient()
    if (!await saveParentNotificationRead(db, access.profile.id, notificationKey)) return false
    revalidatePath("/notifications")
    revalidatePath("/")
    return true
  } catch { return false }
}
