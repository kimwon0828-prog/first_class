import type { SupabaseClient } from "@supabase/supabase-js"

// Caller JWT/RLS validates the event belongs to this Parent. No service client.
export async function saveParentNotificationRead(db: SupabaseClient, parentId: string, notificationKey: string): Promise<boolean> {
  if (!/^(status|report_published|feedback_reminder):[0-9a-f-]{36}$/i.test(notificationKey)) return false
  try {
    const { error } = await db.from("parent_notification_reads").upsert(
      { parent_id: parentId, notification_key: notificationKey },
      { onConflict: "parent_id,notification_key", ignoreDuplicates: true }
    )
    return !error
  } catch { return false }
}
