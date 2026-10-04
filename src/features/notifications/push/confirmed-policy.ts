import "server-only"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export const confirmedPushEnabled = () => process.env.PARENT_SCHEDULE_CONFIRMED_PUSH_ENABLED === "true"
export type ConfirmedPushSettings = {
  mode: "off" | "test" | "all"; test_parent_id: string | null; test_device_ids: string[];
  test_class_id: string | null; test_application_id: string | null; test_started_at: string | null;
}
export async function getConfirmedPushSettings(): Promise<ConfirmedPushSettings> {
  const { data, error } = await getSupabaseServiceRoleClient().from("parent_confirmed_push_settings").select("*").eq("singleton", true).single()
  if (error || !data) throw new Error("confirmed_push_settings_unavailable")
  return data as ConfirmedPushSettings
}

/** Only the operator-selected test application; setup is restricted to a new application for one Parent/class. */
export async function isConfirmedPushTestApplication(applicationId: string, parentId: string | null) {
  if (!confirmedPushEnabled() || !parentId) return false
  const cfg = await getConfirmedPushSettings()
  if (cfg.test_parent_id !== parentId) return false
  if (cfg.test_application_id) return cfg.test_application_id === applicationId
  if (cfg.mode !== "test" || !cfg.test_class_id || !cfg.test_started_at) return false
  const { data, error } = await getSupabaseServiceRoleClient().from("trial_applications").select("id")
    .eq("id", applicationId).eq("parent_id", parentId).eq("class_id", cfg.test_class_id).gte("created_at", cfg.test_started_at).maybeSingle()
  if (error) throw new Error("confirmed_push_test_scope_unavailable")
  return Boolean(data)
}
