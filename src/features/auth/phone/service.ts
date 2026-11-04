import "server-only"
import { randomUUID } from "node:crypto"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { sendSms } from "@/features/notifications/sms/sender"
import { normalizeParentMobile } from "./contracts"
import { generatePhoneOtp, hashOtpIp, hashPhoneOtp } from "./otp"

export const PHONE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type PhoneActionResult = { httpStatus: number; body: Record<string, unknown> }
export type PhoneActionDeps = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>; send: typeof sendSms }
const defaults = (): PhoneActionDeps => {
  const service = getSupabaseServiceRoleClient()
  return { rpc: async (fn, args) => service.rpc(fn, args), send: sendSms }
}

/**
 * Send or verify one parent phone OTP for an already authenticated caller.
 * Callers must first verify the user, the user's own Auth session id, and that the
 * account is pending verification. The RPCs recheck user/session/state independently.
 * Never log or return the code; the phone number only goes to the SMS provider.
 */
export async function runParentPhoneAction(
  input: { action?: unknown; phone?: unknown; challengeId?: unknown; code?: unknown },
  caller: { userId: string; sessionId: string; clientIp: string | null },
  deps: PhoneActionDeps = defaults()
): Promise<PhoneActionResult> {
  if (input.action === "send") {
    const phone = normalizeParentMobile(input.phone)
    if (!phone) return { httpStatus: 400, body: { status: "invalid_phone" } }
    const challenge = randomUUID(), code = generatePhoneOtp()
    const { data, error } = await deps.rpc("begin_parent_phone_challenge", {
      p_user: caller.userId, p_session: caller.sessionId, p_id: challenge, p_phone: phone,
      p_hash: hashPhoneOtp(challenge, caller.userId, code),
      // Vercel supplies its own forwarded IP. User + phone quotas remain authoritative everywhere.
      p_ip_hash: hashOtpIp(caller.clientIp || "unknown")
    })
    const begun = data as { status?: string } | null
    if (error || !begun) return { httpStatus: 503, body: { status: "unavailable" } }
    if (begun.status !== "created") return { httpStatus: 200, body: begun }
    let sent = false
    try {
      // Do not use SMS event logging: its message preview would persist the OTP.
      const result = await deps.send({ recipientType: "parent", phone, messagePreview: `[첫수업] 인증번호 [${code}]를 입력해 주세요. 5분 동안 유효합니다.` })
      sent = result.status === "sent"
    } catch { /* Provider details and recipient never enter logs/responses. */ }
    const marked = await deps.rpc("mark_parent_phone_challenge_sent", { p_user: caller.userId, p_id: challenge, p_sent: sent })
    if (!sent || marked.error) return { httpStatus: 503, body: { status: "unavailable", retryAfter: 60 } }
    return { httpStatus: 200, body: { status: "sent", challengeId: challenge, retryAfter: 60, expiresIn: 300 } }
  }
  if (input.action !== "verify") return { httpStatus: 400, body: { status: "unauthorized" } }
  if (typeof input.challengeId !== "string" || !PHONE_UUID.test(input.challengeId) || typeof input.code !== "string" || !/^\d{6}$/.test(input.code)) {
    return { httpStatus: 400, body: { status: "invalid_code" } }
  }
  const { data, error } = await deps.rpc("verify_parent_phone_challenge", {
    p_user: caller.userId, p_session: caller.sessionId, p_id: input.challengeId, p_hash: hashPhoneOtp(input.challengeId, caller.userId, input.code)
  })
  if (error || !data) return { httpStatus: 503, body: { status: "unavailable" } }
  return { httpStatus: 200, body: data as Record<string, unknown> }
}
