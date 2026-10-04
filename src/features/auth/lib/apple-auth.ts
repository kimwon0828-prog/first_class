/** Auth identities remain Supabase-owned. This flag never grants a role or merges accounts. */
export function hasAppleIdentity(user: { app_metadata?: Record<string, unknown>; identities?: Array<{ provider?: string }> | null }) {
  return user.app_metadata?.provider === "apple" || (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes("apple")) || user.identities?.some(identity => identity.provider === "apple") === true
}

export function isStudioSignup(user: { user_metadata?: Record<string, unknown> }) {
  return ["teacher_invite", "staff_invite", "teacher_public"].includes(String(user.user_metadata?.signup_intent))
}

export function safeAuthReturnTo(raw?: string | null) {
  const value = raw?.trim() ?? ""
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x1f\x7f]/.test(value)) return "/"
  return value
}

export function appleProfileCompletionHref(returnTo: string) {
  const next = safeAuthReturnTo(returnTo)
  return `/auth/complete-profile?returnTo=${encodeURIComponent(next.startsWith("/auth/") ? "/" : next)}`
}
