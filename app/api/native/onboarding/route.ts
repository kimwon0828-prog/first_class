import { createClient } from "@supabase/supabase-js"
import { getPublicEnv } from "@/shared/config/env"
import { detectOAuthEmailConflict } from "@/features/auth/lib/oauth-account-conflict"
import { readNativeParentPhoneState } from "@/features/auth/phone/gate"
import { otpConfigurationReady } from "@/features/auth/phone/otp"
import { runParentPhoneAction } from "@/features/auth/phone/service"
import { createNativeOnboarding } from "@/features/native/server/onboarding"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 학부모 앱 로그인 후 진입 단계(휴대폰 인증 · 이름 · 프로필 생성). 계약은 onboarding.ts 주석.
const handle = createNativeOnboarding({
  client(token) {
    const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
    return createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  },
  phoneState: (db, user) => readNativeParentPhoneState(db, user, { via: "onboarding" }),
  emailConflict: detectOAuthEmailConflict,
  otpReady: otpConfigurationReady,
  phoneAction: (input, caller) => runParentPhoneAction(input, caller)
})
// Device requests need no CORS. Only the local Expo browser preview is allowed.
function localPreview(request: Request, response: Response) {
  const origin = request.headers.get("origin")
  if (process.env.NODE_ENV === "development" && ["http://localhost:8081", "http://127.0.0.1:8081"].includes(origin ?? "")) {
    response.headers.set("Access-Control-Allow-Origin", origin!)
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    response.headers.append("Vary", "Origin")
  }
  return response
}
export async function GET(request: Request) { return localPreview(request, await handle(request)) }
export async function POST(request: Request) { return localPreview(request, await handle(request)) }
export function OPTIONS(request: Request) { return localPreview(request, new Response(null, { status: 204 })) }
