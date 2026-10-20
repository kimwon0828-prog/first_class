import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
export const REVIEW_DEMO_ORGANIZATION = "29e8c477-dabb-404c-bac4-ba96ffd1e999"
export type AppReviewScope = { userId: string; classIds: string[] }
export function decodeAppReviewAccess(value: unknown): string[] | null {
  if (!value || typeof value !== "object" || !("enabled" in value) || value.enabled !== true ||
      !("classIds" in value) || !Array.isArray(value.classIds) || !value.classIds.length || value.classIds.length > 20 ||
      !value.classIds.every(id => typeof id === "string" && uuid.test(id))) return null
  return [...new Set(value.classIds as string[])]
}
export async function requireAppReviewScope(client: SupabaseClient): Promise<AppReviewScope> {
  if (process.env.APP_REVIEW_ACCESS_ENABLED !== "true" || process.env.APP_REVIEW_FIXTURES_READY !== "true") throw new Error("review_access_unavailable")
  const { data: { user }, error } = await client.auth.getUser()
  if (error || !user) throw new Error("login_required")
  const allowedParents = [process.env.APP_REVIEW_PARENT_ID, process.env.APP_REVIEW_DELETE_PARENT_ID]
  if (user.app_metadata?.app_store_review !== true || !allowedParents.includes(user.id)) throw new Error("review_access_denied")
  const access = await client.rpc("get_my_app_store_review_access")
  const classIds = access.error ? null : decodeAppReviewAccess(access.data)
  if (!classIds) throw new Error("review_access_unavailable")
  return { userId: user.id, classIds }
}
export async function requireAppReviewClass(client: SupabaseClient, classId: string, ownerId?: string) {
  const scope = await requireAppReviewScope(client)
  if ((ownerId && ownerId !== scope.userId) || !uuid.test(classId) || !scope.classIds.includes(classId)) throw new Error("review_class_not_allowed")
  return scope
}
