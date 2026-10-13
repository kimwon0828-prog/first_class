import type { SupabaseClient } from "@supabase/supabase-js"
import { parsePushDevice } from "@/features/notifications/push/contracts"

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" }
})

// The standalone push route can ship without the other native API endpoints.
// It preserves the native reader's verified-caller and account gates.
export function createNativePushDeviceHandler(deps: {
  client: (token: string) => SupabaseClient
  enabled: () => boolean
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      if (!token || token.length > 8192) return reply({ error: "login_required" }, 401)
      const db = deps.client(token)
      const { data: { user }, error } = await db.auth.getUser(token)
      if (error || !user) return reply({ error: "login_required" }, 401)
      const [profile, deletion, phone] = await Promise.all([
        db.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
        db.rpc("get_my_parent_account_deletion_status"),
        db.rpc("get_my_parent_phone_status")
      ])
      if (profile.error || deletion.error || phone.error || typeof deletion.data !== "boolean") {
        return reply({ error: "account_unavailable" }, 503)
      }
      if (!profile.data || profile.data.role !== "parent") return reply({ error: "parent_required" }, 403)
      if (deletion.data) return reply({ error: "account_deletion_pending" }, 403)
      if (!phone.data || typeof phone.data.required !== "boolean" ||
          !(phone.data.phoneVerifiedAt === null || typeof phone.data.phoneVerifiedAt === "string")) {
        return reply({ error: "account_unavailable" }, 503)
      }
      if (!phone.data.excluded && phone.data.required && phone.data.phoneVerifiedAt === null) {
        return reply({ error: "phone_verification_required" }, 403)
      }
      return await nativePushDevice(request, db, deps.enabled())
    } catch {
      return reply({ error: "temporarily_unavailable" }, 503)
    }
  }
}

// Called only after the native reader verifies the JWT, Parent role and account gates.
export async function nativePushDevice(request: Request, db: SupabaseClient, enabled: boolean) {
  if (request.method === "GET") return reply({ enabled })
  if (request.method !== "POST") return reply({ error: "not_found" }, 404)
  if (!enabled) return reply({ error: "push_disabled" }, 503)
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "invalid_input" }, 400)
  const raw = await request.text()
  if (raw.length > 2048) return reply({ error: "invalid_input" }, 400)
  let input
  try { input = parsePushDevice(JSON.parse(raw)) } catch { return reply({ error: "invalid_input" }, 400) }
  if (!input) return reply({ error: "invalid_input" }, 400)
  const { error } = await db.rpc("register_parent_push_device", {
    p_installation_id: input.installationId, p_secret: input.installationSecret,
    p_token: input.expoPushToken, p_platform: input.platform,
    p_permission: input.permissionStatus, p_version: input.appVersion
  })
  // RPC binds auth.uid()/session and checks the installation secret and DB switch.
  return error ? reply({ error: "device_registration_failed" }, 409) : reply({ ok: true })
}
