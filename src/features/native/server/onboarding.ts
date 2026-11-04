import type { SupabaseClient, User } from "@supabase/supabase-js"
import { isStudioSignup } from "@/features/auth/lib/apple-auth"
import { preferredOAuthName } from "@/features/auth/lib/oauth-profile-name"
import { normalizeParentMobile } from "@/features/auth/phone/contracts"
import { needsPhoneVerification, type ApplePhoneState } from "@/features/auth/phone/gate"
import { PHONE_UUID, type PhoneActionResult } from "@/features/auth/phone/service"

/**
 * GET · POST /api/native/onboarding (학부모 앱). 로그인 직후와 앱 재실행 때 서비스 진입 단계를 서버가 정한다.
 *   ready → 서비스 이용. phone → 휴대폰 인증. name → 보호자 이름(인증 후 profile이 없고 provider가 이름을 주지 않았을 때).
 * 단계 판정과 profile 생성은 모두 서버에서 한다. 앱이 보내는 단계/번호/인증 여부는 쓰지 않는다.
 * 인증번호 · 전체 번호 · 토큰은 로그에 남기지 않는다. 계정 존재 여부와 다른 계정의 로그인 수단은 응답에 넣지 않는다.
 */
export type NativeOnboardingDeps = {
  client: (token: string) => SupabaseClient
  phoneState: (db: SupabaseClient, user: User) => Promise<ApplePhoneState>
  emailConflict: (userId: string, email: string | undefined) => Promise<{ ok: boolean; reason?: string | null }>
  otpReady: () => boolean
  phoneAction: (input: Record<string, unknown>, caller: { userId: string; sessionId: string; clientIp: string | null }) => Promise<PhoneActionResult>
}
type Step = { step: "ready" } | { step: "name" } | {
  step: "phone"; available: boolean; phone: string | null
  challenge: { challengeId: string; retryAfter: number; expiresIn: number; attemptsLeft: number } | null; retryAfter: number
}
class Stop extends Error { constructor(readonly status: number, readonly code: string) { super(code) } }
const stop = (status: number, code: string): never => { throw new Stop(status, code) }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } })
const count = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.ceil(value))) : 0

export function createNativeOnboarding(deps: NativeOnboardingDeps) {
  async function resolve(db: SupabaseClient, user: User): Promise<Step> {
    if (isStudioSignup(user)) stop(403, "parent_required")
    const [profile, deletion] = await Promise.all([
      db.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
      db.rpc("get_my_parent_account_deletion_status")
    ])
    if (profile.error || deletion.error || typeof deletion.data !== "boolean") stop(503, "onboarding_unavailable")
    if (deletion.data) stop(403, "account_deletion_pending")
    if (profile.data && profile.data.role !== "parent") stop(403, "parent_required")
    if (!profile.data) {
      // Same new-account rule as the web OAuth callback: a new Parent needs a provider email so an
      // existing account with that email can be detected. Apple (relay) and Google always send one;
      // Kakao only when the user agreed to share it.
      if (!user.email?.trim()) stop(403, "email_required")
      const conflict = await deps.emailConflict(user.id, user.email)
      if (!conflict.ok) stop(conflict.reason === "account_check_failed" ? 503 : 403, conflict.reason === "account_check_failed" ? "onboarding_unavailable" : "account_conflict")
    }
    const state = await deps.phoneState(db, user)
    if (state.unavailable) stop(503, "onboarding_unavailable")
    if (state.excluded) stop(403, "parent_required")
    if (needsPhoneVerification(state)) {
      const { data } = await db.rpc("get_my_parent_phone_challenge")
      const resume = data && typeof data === "object" ? data as Record<string, unknown> : {}
      const active = typeof resume.challengeId === "string" && PHONE_UUID.test(resume.challengeId)
      return {
        step: "phone", available: deps.otpReady(),
        // The caller's own number only: the active challenge's number, else their existing contact as a prefill.
        phone: normalizeParentMobile(resume.phone) ?? normalizeParentMobile(state.phone),
        challenge: active ? { challengeId: resume.challengeId as string, retryAfter: count(resume.retryAfter, 60), expiresIn: count(resume.expiresIn, 300), attemptsLeft: count(resume.attemptsLeft, 5) } : null,
        retryAfter: count(resume.retryAfter, 60)
      }
    }
    if (profile.data) return { step: "ready" }
    const name = preferredOAuthName(user)
    return name ? createProfile(db, user, state, name) : { step: "name" }
  }
  async function createProfile(db: SupabaseClient, user: User, state: ApplePhoneState, name: string): Promise<Step> {
    // Verified accounts copy the private OTP proof exactly; the DB guard rejects anything else.
    const verified = state.required && state.verified && state.phoneVerifiedAt
      ? { phone: state.phone ?? null, phone_verification_required: true, phone_verified_at: state.phoneVerifiedAt } : { phone: null }
    const { error } = await db.from("profiles").insert({ id: user.id, role: "parent", name, parent_birth_date: null, organization_id: null, ...verified })
    if (error) {
      // A parallel request may have created it first.
      const again = await db.from("profiles").select("id, role").eq("id", user.id).maybeSingle()
      if (again.error || !again.data) stop(503, "onboarding_unavailable")
      if (again.data!.role !== "parent") stop(403, "parent_required")
    }
    return { step: "ready" }
  }
  return async (request: Request): Promise<Response> => {
    try {
      const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      if (!token || token.length > 8192) return json({ error: "login_required" }, 401)
      const db = deps.client(token)
      const { data: { user }, error } = await db.auth.getUser(token)
      if (error || !user) return json({ error: "login_required" }, 401)
      if (request.method === "GET") return json(await resolve(db, user))
      if (request.method !== "POST") return json({ error: "not_found" }, 404)
      if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "invalid_input" }, 415)
      const raw = await request.text()
      if (raw.length > 2048) return json({ error: "invalid_input" }, 413)
      let input: Record<string, unknown>
      try { input = JSON.parse(raw) } catch { return json({ error: "invalid_input" }, 400) }
      if (!input || typeof input !== "object" || Array.isArray(input) || !["send", "verify", "name"].includes(String(input.action))) return json({ error: "invalid_input" }, 400)
      const current = await resolve(db, user)
      if (input.action === "name") {
        if (current.step !== "name") return json(current)
        const name = typeof input.name === "string" ? input.name.trim() : ""
        if (name.length < 2 || name.length > 30 || /[\x00-\x1f\x7f]/.test(name)) return json({ error: "invalid_name", message: "보호자 이름은 2~30자로 입력해 주세요." }, 400)
        const state = await deps.phoneState(db, user)
        if (state.unavailable || needsPhoneVerification(state)) return json(await resolve(db, user))
        return json(await createProfile(db, user, state, name))
      }
      // Already verified or never required: nothing to send or verify.
      if (current.step !== "phone") return json({ status: "verified", ...current })
      if (!current.available) return json({ status: "unavailable", ...current }, 503)
      // Bind the challenge to this exact Auth session, from the verified token's own claims.
      const { data: claims } = await db.auth.getClaims(token)
      const session = claims?.claims?.session_id
      if (claims?.claims?.sub !== user.id || typeof session !== "string" || !PHONE_UUID.test(session)) return json({ error: "login_required" }, 401)
      const result = await deps.phoneAction({ action: input.action, phone: input.phone, challengeId: input.challengeId, code: input.code }, {
        userId: user.id, sessionId: session, clientIp: request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || null
      })
      if (result.body.status === "verified") return json({ status: "verified", ...(await resolve(db, user)) })
      return json(result.body, result.httpStatus)
    } catch (error) {
      return error instanceof Stop ? json({ error: error.code }, error.status) : json({ error: "onboarding_unavailable" }, 503)
    }
  }
}
