import "server-only"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import type { SupabaseClient } from "@supabase/supabase-js"
import { appleProfileCompletionHref, hasAppleIdentity, hasOAuthPhoneProofIdentity } from "../lib/apple-auth"
import { completePhoneHref } from "./contracts"
type Identity = { id: string; app_metadata?: Record<string, unknown>; identities?: Array<{ provider?: string }> | null }
export type ApplePhoneState = { required: boolean; verified: boolean; phoneVerifiedAt: string | null; profileMissing?: boolean; phone?: string | null; unavailable?: boolean; excluded?: boolean }
type RpcClient = Pick<SupabaseClient, "rpc">
const legacyState: ApplePhoneState = { required: false, verified: false, phoneVerifiedAt: null }
function parseState(data: unknown): ApplePhoneState | null {
  if (!data || typeof data !== "object" || !("required" in data) || typeof data.required !== "boolean" || !("phoneVerifiedAt" in data) || (data.phoneVerifiedAt !== null && typeof data.phoneVerifiedAt !== "string")) return null
  return { ...data, verified: data.phoneVerifiedAt !== null } as ApplePhoneState
}
/** The only phone gate predicate. A missing phone is never a reason to gate a legacy Parent. */
export function needsPhoneVerification(state: ApplePhoneState) {
  return !state.excluded && state.required === true && state.phoneVerifiedAt === null
}
/** Read the explicit state for every provider. Only enrollment classifies new Apple accounts. */
export async function getApplePhoneState(user: Identity): Promise<ApplePhoneState> {
  void user // RPC binds the trusted auth.uid(); never accept a caller-supplied user id.
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
/** Same status RPC as the web gate, bound to the caller's own JWT client (native Bearer). */
export async function readParentPhoneState(db: RpcClient): Promise<ApplePhoneState> {
  try {
    const { data, error } = await db.rpc("get_my_parent_phone_status")
    return (!error && parseState(data)) || { ...legacyState, unavailable: true }
  } catch { return { ...legacyState, unavailable: true } }
}
/**
 * Existing-account enrollment. FIXED "off" in this release; there is no env or client switch.
 * A stored requirement is account-wide and DB-backed: installed apps (no verification screen) on any
 * device are blocked as soon as it exists, and turning a switch off afterwards does not remove it.
 * The server cannot tell old and new apps apart without trusting a client value, so enrolling existing
 * Apple/Google-linked accounts must wait for a release that also retires older apps and ships audited
 * rollback tooling (see docs/native-google-phone-auth.md). Tests pass `mode: "all"` to show that path.
 */
export type ExistingPhoneGateMode = "off" | "all"
const EXISTING_ACCOUNT_ENROLLMENT: ExistingPhoneGateMode = "off"
type EnrollResult = { state: ApplePhoneState } | { missing: true } | { failed: true }
export type NativePhoneGateDeps = {
  enroll: (userId: string) => Promise<EnrollResult>
  enrollLegacyApple: (userId: string) => Promise<EnrollResult>
  warn: (message: string) => void
}
async function enrollWith(fn: string, userId: string): Promise<EnrollResult> {
  try {
    const { data, error } = await getSupabaseServiceRoleClient().rpc(fn, { p_user: userId })
    if (error?.code === "PGRST202") return { missing: true } // migration not applied yet
    const state = !error && parseState(data)
    return state ? { state } : { failed: true }
  } catch { return { failed: true } }
}
const defaultGateDeps: NativePhoneGateDeps = {
  enroll: userId => enrollWith("enroll_oauth_parent_phone", userId),
  enrollLegacyApple: userId => enrollWith("enroll_new_apple_parent_phone", userId),
  warn: message => console.warn(message)
}
const hasProvider = (user: { identities?: Array<{ provider?: string }> | null }, provider: string) =>
  user.identities?.some(identity => identity.provider === provider) === true
/**
 * Native entry gate. Reads the caller's own status, then decides on the server whether this
 * Apple/Google account must be enrolled now. A stored phone string never counts as verified;
 * the enrollment RPC rechecks identity, role and deletion itself.
 */
export async function readNativeParentPhoneState(
  db: RpcClient, user: { id: string; identities?: Array<{ provider?: string }> | null },
  options: { via: "onboarding" | "api"; mode?: ExistingPhoneGateMode; deps?: NativePhoneGateDeps }
): Promise<ApplePhoneState> {
  const deps = options.deps ?? defaultGateDeps, mode = options.mode ?? EXISTING_ACCOUNT_ENROLLMENT
  const state = await readParentPhoneState(db)
  if (state.unavailable || state.excluded || state.verified || state.required || !hasOAuthPhoneProofIdentity(user)) return state
  const google = hasProvider(user, "google")
  const newSignup = state.profileMissing === true
  // Profile creation only happens in onboarding; other APIs already answer parent_required.
  if (newSignup && options.via !== "onboarding") return state
  // A new signup has no profile, so no installed app can be using it yet. An existing profile (incl. one
  // that Supabase later linked a Google identity into) is only enrolled when existing enrollment is on.
  if (!newSignup && mode !== "all") return state
  let result = await deps.enroll(user.id)
  // Before the migration: new Apple signups keep the existing web enrollment contract.
  if ("missing" in result && newSignup && hasProvider(user, "apple") && !google) result = await deps.enrollLegacyApple(user.id)
  if ("state" in result) return result.state
  // Never create a requirement from a failure. New signups have no legacy path to keep, so they stop
  // with a retryable error; existing Parents keep today's access.
  if (newSignup) return { ...state, unavailable: true }
  deps.warn("[native-phone-gate] existing-account enrollment unavailable")
  return state
}
export async function enrollOAuthParentPhone(userId: string): Promise<ApplePhoneState> {
  const result = await enrollWith("enroll_oauth_parent_phone", userId)
  return "state" in result ? result.state : { ...legacyState, unavailable: true }
}
