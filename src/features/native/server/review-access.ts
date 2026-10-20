import "server-only"
import { decodeAppReviewAccess } from "@/shared/lib/db/app-store-review-access"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ReviewAccessConfig = { email: string; userId: string; deletion?: { email: string; userId: string } }
// Deliberately off until the dedicated account and synthetic fixtures have been
// checked. No password, privileged key or role override belongs in this module.
export function reviewAccessConfigFromEnv(): ReviewAccessConfig | null {
  const email = process.env.APP_REVIEW_LOGIN_EMAIL?.trim()
  const userId = process.env.APP_REVIEW_PARENT_ID?.trim()
  if (process.env.APP_REVIEW_ACCESS_ENABLED !== "true" || process.env.APP_REVIEW_FIXTURES_READY !== "true" ||
      !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !userId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(userId)) return null
  const deletionEmail = process.env.APP_REVIEW_DELETE_LOGIN_EMAIL?.trim()
  const deletionId = process.env.APP_REVIEW_DELETE_PARENT_ID?.trim()
  if ((deletionEmail || deletionId) && (!deletionEmail || deletionEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deletionEmail) ||
      !deletionId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(deletionId) || deletionId === userId || deletionEmail.toLowerCase() === email.toLowerCase())) return null
  return { email, userId, ...(deletionEmail && deletionId ? { deletion: { email: deletionEmail, userId: deletionId } } : {}) }
}
const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" }
})
export async function nativeReviewAccess(request: Request, deps: {
  config: ReviewAccessConfig | null; client: () => SupabaseClient
}): Promise<Response> {
  if (request.method === "GET") return json({ enabled: Boolean(deps.config) })
  if (request.method !== "POST") return json({ error: "not_found" }, 404)
  if (!deps.config) return json({ error: "review_access_unavailable" }, 503)
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "invalid_input" }, 415)
  // Limit the body before parsing. Auth's existing password/captcha/rate limits
  // still apply; this route never uses Auth admin to mint a session.
  const reader = request.body?.getReader()
  if (!reader) return json({ error: "invalid_input" }, 400)
  const decoder = new TextDecoder(); let raw = "", bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 4096) { await reader.cancel(); return json({ error: "invalid_input" }, 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
  } catch { return json({ error: "invalid_input" }, 400) }
  let body: unknown
  try { body = JSON.parse(raw) } catch { return json({ error: "invalid_input" }, 400) }
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["password", "account"].includes(key)) ||
      !("password" in body) || typeof body.password !== "string" || body.password.length < 1 || body.password.length > 256) return json({ error: "invalid_input" }, 400)
  const account = "account" in body ? body.account : "tour"
  if (account !== "tour" && account !== "deletion") return json({ error: "invalid_input" }, 400)
  const selected = account === "deletion" ? deps.config.deletion : deps.config
  if (!selected) return json({ error: "review_access_unavailable" }, 503)
  try {
    const db = deps.client()
    const { data, error } = await db.auth.signInWithPassword({ email: selected.email, password: body.password })
    if (error?.status === 429) return json({ error: "review_access_rate_limited" }, 429)
    if (error || !data.session || !data.user) return json({ error: "review_access_denied" }, 401)
    // Authenticate the actual session and require the server-created marker.
    // Client-controlled user_metadata is never consulted for access or roles.
    const verified = await db.auth.getUser(data.session.access_token)
    const user = verified.data.user
    if (verified.error || !user || user.id !== selected.userId || data.user.id !== user.id ||
        user.email?.toLowerCase() !== selected.email.toLowerCase() || user.app_metadata?.app_store_review !== true) return json({ error: "review_access_denied" }, 403)
    const [profile, pending, phone, access] = await Promise.all([
      db.from("profiles").select("role,organization_id").eq("id", user.id).maybeSingle(),
      db.rpc("get_my_parent_account_deletion_status"), db.rpc("get_my_parent_phone_status"), db.rpc("get_my_app_store_review_access")
    ])
    if (profile.error || pending.error || phone.error || access.error) return json({ error: "review_access_unavailable" }, 503)
    if (!decodeAppReviewAccess(access.data) || profile.data?.role !== "parent" || profile.data.organization_id !== null || pending.data !== false ||
        !phone.data || typeof phone.data.required !== "boolean" ||
        (phone.data.required && !phone.data.excluded && !phone.data.phoneVerifiedAt)) return json({ error: "review_access_denied" }, 403)
    // Only a normal, nonprivileged first-party session reaches the device.
    return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
  } catch { return json({ error: "review_access_unavailable" }, 503) }
}
