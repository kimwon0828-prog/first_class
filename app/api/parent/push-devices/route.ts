import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getProfileForUser } from "@/features/auth/lib/profile-sync"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import { parsePushDevice } from "@/features/notifications/push/contracts"
export const dynamic = "force-dynamic"
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } })
async function parentClient() {
  const db = await getSupabaseServerClient()
  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user || await isMyParentAccountDeletionPending()) return null
  const profile = await getProfileForUser(user)
  return profile.status === "ok" && profile.profile.role === "parent" ? db : null
}
export async function GET() {
  if (process.env.PARENT_PUSH_REGISTRATION_ENABLED !== "true") return reply({ enabled: false })
  try { return reply({ enabled: true, parent: Boolean(await parentClient()) }) }
  catch { return reply({ error: "push_unavailable" }, 503) }
}
export async function POST(request: Request) {
  if (process.env.PARENT_PUSH_REGISTRATION_ENABLED !== "true") return reply({ error: "push_disabled" }, 503)
  const origin = request.headers.get("origin")
  try { if (!origin || (new URL(origin).host !== request.headers.get("host") || new URL(origin).protocol !== new URL(request.url).protocol)) return reply({ error: "forbidden_origin" }, 403) }
  catch { return reply({ error: "forbidden_origin" }, 403) }
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "invalid_input" }, 400)
  try {
    const db = await parentClient()
    if (!db) return reply({ error: "parent_session_required" }, 401)
    const raw = await request.text()
    if (raw.length > 2048) return reply({ error: "invalid_input" }, 400)
    const input = parsePushDevice(JSON.parse(raw))
    if (!input) return reply({ error: "invalid_input" }, 400)
    // No service-role client and no client-supplied parent_id. RPC obtains auth.uid().
    const { error } = await db.rpc("register_parent_push_device", {
      p_installation_id: input.installationId, p_secret: input.installationSecret,
      p_token: input.expoPushToken, p_platform: input.platform,
      p_permission: input.permissionStatus, p_version: input.appVersion
    })
    if (error) return reply({ error: "device_registration_failed" }, 409)
    return reply({ ok: true })
  } catch { return reply({ error: "push_unavailable" }, 503) }
}
