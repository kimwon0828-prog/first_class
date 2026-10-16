import type { SupabaseClient } from "@supabase/supabase-js"
import type { ParentDeletionResult } from "@/features/my/lib/parent-account-deletion-workflow"
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } })
export async function nativeDeletion(request: Request, db: SupabaseClient, options: { enabled: boolean; run: () => Promise<ParentDeletionResult> }) {
  if (!["GET", "POST"].includes(request.method)) return json({ error: "not_found" }, 404)
  if (request.method === "POST") {
    if (!options.enabled) return json({ error: "deletion_disabled" }, 503)
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "invalid_confirmation" }, 400)
    const text = await request.text()
    if (text.length > 100) return json({ error: "invalid_confirmation" }, 400)
    try {
      const body = JSON.parse(text)
      if (!body || Object.keys(body).length !== 1 || body.confirmation !== "delete") return json({ error: "invalid_confirmation" }, 400)
    } catch { return json({ error: "invalid_confirmation" }, 400) }
  }
  const { data: { user }, error: authError } = await db.auth.getUser()
  if (authError || !user) return json({ error: "login_required" }, 401)
  const [profile, deletion] = await Promise.all([
    db.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    db.rpc("get_my_parent_account_deletion_status")
  ])
  if (profile.error || deletion.error || typeof deletion.data !== "boolean") return json({ error: "account_unavailable" }, 503)
  // The existing self-only retry marker remains usable after personal/profile cleanup.
  if (profile.data?.role !== "parent" && !deletion.data) return json({ error: "parent_required" }, 403)
  if (request.method === "GET") return json({ enabled: options.enabled, pending: deletion.data })
  const result = await options.run()
  return json(result, result.status === "success" ? 200 : 503)
}
