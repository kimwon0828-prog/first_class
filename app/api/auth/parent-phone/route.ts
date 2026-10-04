import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getApplePhoneState } from "@/features/auth/phone/gate"
import { normalizeParentMobile, phoneReturnTo } from "@/features/auth/phone/contracts"
import { generatePhoneOtp, hashPhoneOtp, hashOtpIp, otpConfigurationReady } from "@/features/auth/phone/otp"
import { appleProfileCompletionHref, isStudioSignup } from "@/features/auth/lib/apple-auth"
import { detectOAuthEmailConflict } from "@/features/auth/lib/oauth-account-conflict"
import { sendSms } from "@/features/notifications/sms/sender"
export const runtime = "nodejs"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
    const service = getSupabaseServiceRoleClient()
    if (input.action === "send") {
      const phone = normalizeParentMobile(input.phone)
      if (!phone) return response({ status: "invalid_phone" }, 400)
      const challenge = randomUUID(), code = generatePhoneOtp()
      const { data, error: beginError } = await service.rpc("begin_parent_phone_challenge", {
        p_user: user.id, p_session: session, p_id: challenge, p_phone: phone, p_hash: hashPhoneOtp(challenge, user.id, code),
        // Vercel supplies its own forwarded IP. User + phone quotas remain authoritative everywhere.
        p_ip_hash: hashOtpIp(request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown")
      })
      if (beginError || !data) return response({ status: "unavailable" }, 503)
      if (data.status !== "created") return response(data)
      let sent = false
      try {
        // Do not use SMS event logging: its message preview would persist the OTP.
        const result = await sendSms({ recipientType: "parent", phone, messagePreview: `[첫수업] 인증번호 [${code}]를 입력해 주세요. 5분 동안 유효합니다.` })
        sent = result.status === "sent"
      } catch { /* Provider details and recipient never enter logs/responses. */ }
      const marked = await service.rpc("mark_parent_phone_challenge_sent", { p_user: user.id, p_id: challenge, p_sent: sent })
      if (!sent || marked.error) return response({ status: "unavailable", retryAfter: 60 }, 503)
      return response({ status: "sent", challengeId: challenge, retryAfter: 60 })
    }
    if (typeof input.challengeId !== "string" || !uuid.test(input.challengeId) || typeof input.code !== "string" || !/^\d{6}$/.test(input.code)) return response({ status: "invalid_code" }, 400)
    const { data, error: verifyError } = await service.rpc("verify_parent_phone_challenge", {
      p_user: user.id, p_session: session, p_id: input.challengeId, p_hash: hashPhoneOtp(input.challengeId, user.id, input.code)
    })
    if (verifyError || !data) return response({ status: "unavailable" }, 503)
    return response({ ...data, ...(data.status === "verified" ? { next: state.profileMissing ? appleProfileCompletionHref(next) : next } : {}) })
  } catch { return response({ status: "unavailable" }, 503) }
}
