import "server-only"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export async function hasLiveParentAccountRecipient(applicationId: string, parentId: string | null) {
  if (!parentId) return false
  const client = getSupabaseServiceRoleClient()
  const [application, profile] = await Promise.all([
    client.from("trial_applications").select("parent_id").eq("id", applicationId).maybeSingle(),
    client.from("profiles").select("role").eq("id", parentId).maybeSingle()
  ])
  if (application.error || profile.error) throw new Error("parent_notification_recipient_unavailable")
  return application.data?.parent_id === parentId && profile.data?.role === "parent"
}
