import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getApplePhoneState } from "@/features/auth/phone/gate"
import { phoneReturnTo } from "@/features/auth/phone/contracts"
import { otpConfigurationReady } from "@/features/auth/phone/otp"
import { PHONE_UUID as uuid, runParentPhoneAction } from "@/features/auth/phone/service"
import { appleProfileCompletionHref, isStudioSignup } from "@/features/auth/lib/apple-auth"
import { detectOAuthEmailConflict } from "@/features/auth/lib/oauth-account-conflict"
export const runtime = "nodejs"
const response = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } })
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return response({ status: "unauthorized" }, 403)
  try {
    const raw = await request.text()
    if (raw.length > 2048) return response({ status: "unauthorized" }, 400)
    const input = JSON.parse(raw)
    if (!input || !["send", "verify"].includes(input.action)) return response({ status: "unauthorized" }, 400)
    const next = phoneReturnTo(typeof input.returnTo === "string" ? input.returnTo : null)
    const db = await getSupabaseServerClient()
    const { data: { user }, error } = await db.auth.getUser()
    if (error || !user || isStudioSignup(user)) return response({ status: "unauthorized" }, 401)
    const state = await getApplePhoneState(user)
    if (state.unavailable) return response({ status: "unavailable" }, 503)
    if (!state.required || state.excluded) return response({ status: "unauthorized" }, 403)
    if (state.unavailable || !otpConfigurationReady()) return response({ status: "unavailable" }, 503)
    if (state.verified) return response({ status: "verified", next: state.profileMissing ? appleProfileCompletionHref(next) : next })
    const { data: claimsData } = await db.auth.getClaims()
    const session = claimsData?.claims?.session_id
    if (claimsData?.claims?.sub !== user.id || typeof session !== "string" || !uuid.test(session)) return response({ status: "unauthorized" }, 401)
    const conflict = await detectOAuthEmailConflict(user.id, user.email)
    if (!conflict.ok) return response({ status: "unauthorized" }, 403)
    const result = await runParentPhoneAction(input, {
      userId: user.id, sessionId: session, clientIp: request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || null
    })
    const verified = result.body.status === "verified"
    return response({ ...result.body, ...(verified ? { next: state.profileMissing ? appleProfileCompletionHref(next) : next } : {}) }, result.httpStatus)
  } catch { return response({ status: "unavailable" }, 503) }
}
