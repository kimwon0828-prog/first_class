import "server-only"
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto"

/** Server-only credentials. Never return these or provider tokens to logs/API responses. */
export type AppleRevocationConfig = {
  clientId: string
  teamId: string
  keyId: string
  privateKey: string
}
type AppleUser = {
  identities?: Array<{ provider?: string; provider_id?: string; identity_data?: { sub?: unknown } }> | null
}
type Failure = "apple_configuration_unavailable" | "apple_identity_required" | "apple_token_required" | "apple_verification_failed" | "apple_revocation_failed"
export type AppleRevocationResult = { ok: true } | { ok: false; error: Failure }
type Options = { config: AppleRevocationConfig | null; fetch?: typeof fetch; now?: () => number }
const issuer = "https://appleid.apple.com"
const failed = (error: Failure): AppleRevocationResult => ({ ok: false, error })

export function appleRevocationConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AppleRevocationConfig | null {
  const { APPLE_CLIENT_ID: clientId, APPLE_TEAM_ID: teamId, APPLE_KEY_ID: keyId, APPLE_PRIVATE_KEY: privateKey } = env
  return clientId && teamId && keyId && privateKey ? { clientId, teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n") } : null
}

function clientSecret(config: AppleRevocationConfig, now: number) {
  if (!config.clientId || !/^[A-Z0-9]{10}$/.test(config.teamId) || !/^[A-Z0-9]{10}$/.test(config.keyId)) throw new Error("invalid_configuration")
  const key = createPrivateKey(config.privateKey)
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") throw new Error("invalid_configuration")
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const input = `${encode({ alg: "ES256", kid: config.keyId, typ: "JWT" })}.${encode({ iss: config.teamId, sub: config.clientId, aud: issuer, iat: now, exp: now + 300 })}`
  return `${input}.${sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" }).toString("base64url")}`
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error("apple_request_failed")
  const text = await response.text()
  if (text.length > 65536) throw new Error("apple_response_invalid")
  const body: unknown = JSON.parse(text)
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("apple_response_invalid")
  return body as Record<string, unknown>
}

async function verifyIdentityToken(token: unknown, subject: string, clientId: string, now: number, request: typeof fetch) {
  if (typeof token !== "string" || token.length > 16384) return false
  const parts = token.split(".")
  if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString())
  if (header.alg !== "RS256" || typeof header.kid !== "string") return false
  const jwks = await readJson(await request(`${issuer}/auth/keys`, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000) }))
  if (!Array.isArray(jwks.keys)) return false
  const keys = jwks.keys.filter(key => key && typeof key === "object" && key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256" && key.use === "sig")
  if (keys.length !== 1) return false
  const key = createPublicKey({ key: keys[0], format: "jwk" })
  if (!verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"))) return false
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString())
  return claims.iss === issuer && claims.aud === clientId && claims.sub === subject &&
    typeof claims.exp === "number" && claims.exp > now && typeof claims.iat === "number" && claims.iat <= now + 60
}

/**
 * Call only with a user returned by Supabase Auth getUser(), never client claims.
 * A successful /revoke response alone does not establish token ownership: Apple
 * also returns 200 for already-invalid tokens. First exchange and verify the ID
 * token against Apple's keys and this authenticated user's linked Apple subject.
 * provider_refresh_token is Apple's token, NOT the Supabase session refresh_token.
 */
export async function revokeAppleGrantForUser(user: AppleUser, refreshToken: unknown, options: Options): Promise<AppleRevocationResult> {
  const identities = user.identities?.filter(identity => identity.provider === "apple") ?? []
  if (identities.length !== 1) return failed("apple_identity_required")
  const identity = identities[0]
  const subject = typeof identity.identity_data?.sub === "string" ? identity.identity_data.sub : identity.provider_id
  if (!subject) return failed("apple_identity_required")
  if (typeof refreshToken !== "string" || !refreshToken || refreshToken.length > 8192 || /\s/.test(refreshToken)) return failed("apple_token_required")
  if (!options.config) return failed("apple_configuration_unavailable")
  const config = options.config
  const now = Math.floor((options.now ?? Date.now)() / 1000)
  let secret: string
  try { secret = clientSecret(config, now) } catch { return failed("apple_configuration_unavailable") }
  const request = options.fetch ?? fetch
  const post = (path: string, fields: Record<string, string>) => request(`${issuer}${path}`, {
    method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: secret, ...fields })
  })
  try {
    const response = await readJson(await post("/auth/token", { grant_type: "refresh_token", refresh_token: refreshToken }))
    if (!await verifyIdentityToken(response.id_token, subject, config.clientId, now, request)) return failed("apple_verification_failed")
  } catch { return failed("apple_verification_failed") }
  try {
    // Refresh validation need not return another refresh_token; revoke the one
    // whose ownership was just verified, not an optional replacement field.
    const response = await post("/auth/revoke", { token: refreshToken, token_type_hint: "refresh_token" })
    return response.ok ? { ok: true } : failed("apple_revocation_failed")
  } catch { return failed("apple_revocation_failed") }
}
