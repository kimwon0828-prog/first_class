import { createClient } from "@supabase/supabase-js"
import { getPublicEnv } from "@/shared/config/env"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getAppReviewClassDetailWithSafeProjection } from "@/features/classes/queries/public-class-safe-projection"
import { listAvailableScheduleSlotsByClassIdWithClient } from "@/shared/lib/db/supabase-adapter"
import { createNativeReviewCatalog } from "@/features/native/server/review-catalog"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const read = createNativeReviewCatalog({
  client(token) {
    const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
    return createClient(supabaseUrl, supabasePublishableKey, { global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  },
  detail: getAppReviewClassDetailWithSafeProjection,
  slots: (db, classId) => listAvailableScheduleSlotsByClassIdWithClient({ classId, supabase: getSupabaseServiceRoleClient(), reviewClient: db })
})
function localPreview(request: Request, response: Response) {
  const origin = request.headers.get("origin")
  if (process.env.NODE_ENV === "development" && ["http://localhost:8081", "http://127.0.0.1:8081"].includes(origin ?? "")) {
    response.headers.set("Access-Control-Allow-Origin", origin!)
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS")
    response.headers.append("Vary", "Origin")
  }
  return response
}
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) { return localPreview(request, await read(request, (await params).path)) }
export function OPTIONS(request: Request) { return localPreview(request, new Response(null, { status: 204 })) }
