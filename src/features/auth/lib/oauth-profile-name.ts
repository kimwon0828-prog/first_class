import { hasAppleIdentity } from "./apple-auth"

/**
 * Display name for a new Parent profile from the provider's own metadata.
 * Apple may withhold the name: returns undefined so the name step is shown.
 * Other providers fall back to the email local part, then "학부모".
 */
export function preferredOAuthName(user: {
  email?: string | null
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null
}) {
  const metadata = user.user_metadata ?? {}
  const identityData = user.identities?.[0]?.identity_data ?? {}
  const candidates = [
    metadata.name,
    metadata.full_name,
    metadata.nickname,
    identityData.name,
    identityData.nickname,
    identityData.profile_nickname
  ]

  const preferred = candidates.find((value) => typeof value === "string" && value.trim().length > 0)
  if (typeof preferred === "string") {
    return preferred.trim().slice(0, 30)
  }

  if (hasAppleIdentity(user)) return undefined

  const emailLocalPart = user.email?.split("@")[0]?.trim()
  return emailLocalPart?.slice(0, 30) || "학부모"
}
