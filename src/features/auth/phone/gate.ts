import "server-only"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { appleProfileCompletionHref, hasAppleIdentity } from "../lib/apple-auth"
import { completePhoneHref } from "./contracts"
type Identity = { id: string; app_metadata?: Record<string, unknown>; identities?: Array<{ provider?: string }> | null }
export type ApplePhoneState = { required: boolean; verified: boolean; phoneVerifiedAt: string | null; profileMissing?: boolean; phone?: string | null; unavailable?: boolean; excluded?: boolean }
const legacyState: ApplePhoneState = { required: false, verified: false, phoneVerifiedAt: null }
function parseState(data: unknown): ApplePhoneState | null {
  if (!data || typeof data !== "object" || !("required" in data) || typeof data.required !== "boolean" || !("phoneVerifiedAt" in data) || (data.phoneVerifiedAt !== null && typeof data.phoneVerifiedAt !== "string")) return null
  return { ...data, verified: data.phoneVerifiedAt !== null } as ApplePhoneState
}
/** The only phone gate predicate. A missing phone is never a reason to gate a legacy Parent. */
export function needsPhoneVerification(state: ApplePhoneState) {
  return !state.excluded && state.required === true && state.phoneVerifiedAt === null
}
/** Read-only, zero RPC for Kakao; missing migration/status never enrolls or blocks legacy users. */
export async function getApplePhoneState(user: Identity): Promise<ApplePhoneState> {
  if (!hasAppleIdentity(user)) return legacyState
  try {
    const db = await getSupabaseServerClient()
    const { data, error } = await db.rpc("get_my_parent_phone_status")
    return (!error && parseState(data)) || { ...legacyState, unavailable: true }
  } catch { return { ...legacyState, unavailable: true } }
}
/** Only call after verified getUser and a missing profile. RPC independently rechecks identity/role/existence. */
export async function enrollNewAppleParentPhone(user: Identity): Promise<ApplePhoneState> {
  if (!hasAppleIdentity(user)) return legacyState
  try {
    const { data, error } = await getSupabaseServiceRoleClient().rpc("enroll_new_apple_parent_phone", { p_user: user.id })
    return (!error && parseState(data)) || { ...legacyState, unavailable: true }
  } catch { return { ...legacyState, unavailable: true } }
}
export async function applePhoneGateHref(user: Identity, next: string) {
  const state = await getApplePhoneState(user)
  if (needsPhoneVerification(state)) return completePhoneHref(next)
  // Name completion is separate from the phone gate, only after new onboarding verified.
  return state.profileMissing && state.verified ? appleProfileCompletionHref(next) : null
}
