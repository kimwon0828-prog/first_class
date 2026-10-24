import type { SupabaseClient } from "@supabase/supabase-js"

import {
  MARKETING_CONSENT_ERROR_STATUS,
  parseMarketingConsentInput
} from "@/features/marketing-consent/lib/marketing-consent"
import { listAcademyMarketingConsents, setAcademyMarketingConsent } from "@/features/marketing-consent/server/marketing-consent-db"
import { toMarketingConsentChange, type MarketingConsentChange } from "@/features/marketing-consent/lib/consent-notice"

const reply = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "private, no-store", Vary: "Authorization" }
})

/**
 * GET · POST /api/native/me/marketing-consents (학부모 앱, 2차-3 명세 그대로).
 *
 * 입구 확인은 push-device 와 같다: Bearer 토큰 → 학부모 계정 → 탈퇴 진행 중 아님 → 휴대폰 확인.
 * 동의 · 철회 자체의 권한(본인만)은 RPC 가 auth.uid() 로 다시 본다.
 * RPC 가 changed = true 를 돌려주면 onChanged 를 부른다(처리 결과 알림 — 같은 값 재요청이면 false).
 */
export function createNativeMarketingConsentHandler(deps: {
  client: (token: string) => SupabaseClient
  onChanged?: (change: MarketingConsentChange) => void
}) {
  return async (request: Request): Promise<Response> => {
    try {
      const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
      if (!token || token.length > 8192) return reply({ error: "login_required" }, 401)
      const db = deps.client(token)
      const { data: { user }, error } = await db.auth.getUser(token)
      if (error || !user) return reply({ error: "login_required" }, 401)
      const [profile, deletion, phone] = await Promise.all([
        db.from("profiles").select("id, role").eq("id", user.id).maybeSingle(),
        db.rpc("get_my_parent_account_deletion_status"),
        db.rpc("get_my_parent_phone_status")
      ])
      if (profile.error || deletion.error || phone.error || typeof deletion.data !== "boolean") {
        return reply({ error: "account_unavailable" }, 503)
      }
      if (!profile.data || profile.data.role !== "parent") return reply({ error: "parent_required" }, 403)
      if (deletion.data) return reply({ error: "account_deletion_pending" }, 403)
      if (!phone.data || typeof phone.data.required !== "boolean" ||
          !(phone.data.phoneVerifiedAt === null || typeof phone.data.phoneVerifiedAt === "string")) {
        return reply({ error: "account_unavailable" }, 503)
      }
      if (!phone.data.excluded && phone.data.required && phone.data.phoneVerifiedAt === null) {
        return reply({ error: "phone_verification_required" }, 403)
      }

      if (request.method === "GET") {
        const result = await listAcademyMarketingConsents(db)
        return result.ok ? reply({ items: result.items }) : reply({ error: result.error }, MARKETING_CONSENT_ERROR_STATUS[result.error])
      }
      if (request.method !== "POST") return reply({ error: "not_found" }, 404)
      if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "invalid_consent_input" }, 400)
      const raw = await request.text()
      if (raw.length > 2048) return reply({ error: "invalid_consent_input" }, 400)
      let body: unknown
      try { body = JSON.parse(raw) } catch { return reply({ error: "invalid_consent_input" }, 400) }
      const input = parseMarketingConsentInput(body, "parent_app")
      if (!input.ok) return reply({ error: input.error }, MARKETING_CONSENT_ERROR_STATUS[input.error])
      const result = await setAcademyMarketingConsent(db, input.value)
      if (!result.ok) return reply({ error: result.error }, MARKETING_CONSENT_ERROR_STATUS[result.error])
      if (result.changed === true) {
        try { deps.onChanged?.(toMarketingConsentChange(user.id, "parent_app", result.item)) } catch { /* 알림 실패가 저장 응답을 바꾸지 않는다 */ }
      }
      return reply(result.item)
    } catch {
      return reply({ error: "temporarily_unavailable" }, 503)
    }
  }
}
