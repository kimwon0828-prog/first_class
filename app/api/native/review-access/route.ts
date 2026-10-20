import { createClient } from "@supabase/supabase-js"
import { getPublicEnv } from "@/shared/config/env"
import { nativeReviewAccess, reviewAccessConfigFromEnv } from "@/features/native/server/review-access"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
function localPreview(request: Request, response: Response) {
  const origin = request.headers.get("origin")
  if (process.env.NODE_ENV === "development" && ["http://localhost:8081", "http://127.0.0.1:8081"].includes(origin ?? "")) {
    response.headers.set("Access-Control-Allow-Origin", origin!)
    response.headers.set("Access-Control-Allow-Headers", "Content-Type")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  }
  return response
}
async function handle(request: Request) {
  const response = await nativeReviewAccess(request, { config: reviewAccessConfigFromEnv(), client: () => {
    const env = getPublicEnv()
    return createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  } })
  return localPreview(request, response)
}
export const GET = handle
export const POST = handle
export function OPTIONS(request: Request) { return localPreview(request, new Response(null, { status: 204 })) }
