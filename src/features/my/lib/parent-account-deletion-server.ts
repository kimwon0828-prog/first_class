import "server-only"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

// Enabled after the approved schema rollout. An explicit 0 is an emergency
// server-side kill switch; authorization remains in Auth + the self-only RPC.
export function isParentAccountDeletionEnabled() {
  return process.env.PARENT_ACCOUNT_DELETION_ENABLED !== "0"
}

export async function isMyParentAccountDeletionPending() {
  if (!isParentAccountDeletionEnabled()) return false
  const client = await getSupabaseServerClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return false
  const { data, error } = await client.rpc("get_my_parent_account_deletion_status")
  if (error) throw new Error("account_deletion_status_unavailable")
  return data === true
}
