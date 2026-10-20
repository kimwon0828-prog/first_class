import "server-only"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
// Missing migration, unknown ownership and RPC failure are never permission to
// call an external provider. Safe wrappers keep the business mutation successful.
export async function canSendApplicationNotification(applicationId: string): Promise<boolean> {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(applicationId)) return false
  const { data, error } = await getSupabaseServiceRoleClient().rpc("get_app_store_review_notification_policy", { p_application_id: applicationId })
  if (error) throw new Error("notification_review_policy_unavailable")
  return data === "normal"
}
