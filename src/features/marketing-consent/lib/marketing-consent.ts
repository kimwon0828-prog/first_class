// 학원 안내 문자(광고성 정보) 수신 동의 — 학부모 앱 · 웹 공용 계약(2차-3).
// 명세: 동의는 학원마다 따로 받고, 학부모 본인만 바꾼다. 서버(RPC set_my_academy_marketing_consent)가
// auth.uid() 로 판단하므로 요청 본문에 학부모 id 를 받지 않는다.

/** 동의 화면 문구 버전. 문구를 바꾸면 값을 바꾼다(서버는 기록만 한다). */
export const MARKETING_CONSENT_TEXT_VERSION = "academy-marketing-2026-10"

export type MarketingConsentSource = "parent_app" | "parent_web"

export type MarketingConsentInput = {
  organizationId: string
  consented: boolean
  source: MarketingConsentSource
  textVersion: string
}

export type MarketingConsentItem = {
  organizationId: string
  organizationName?: string
  consented: boolean
  consentedAt: string | null
  withdrawnAt: string | null
}

export type MarketingConsentErrorCode =
  | "invalid_consent_input"
  | "invalid_consent_source"
  | "parent_required"
  | "organization_not_found"
  | "temporarily_unavailable"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** 요청 본문 검사. source 는 부르는 쪽(앱 · 웹)마다 하나만 받는다. */
export const parseMarketingConsentInput = (
  body: unknown,
  allowedSource: MarketingConsentSource
): { ok: true; value: MarketingConsentInput } | { ok: false; error: MarketingConsentErrorCode } => {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "invalid_consent_input" }
  const input = body as Record<string, unknown>
  if (input.source !== allowedSource) {
    return { ok: false, error: input.source === "parent_app" || input.source === "parent_web" ? "invalid_consent_input" : "invalid_consent_source" }
  }
  const textVersion = typeof input.textVersion === "string" ? input.textVersion.trim() : ""
  if (
    typeof input.organizationId !== "string" || !UUID.test(input.organizationId) ||
    typeof input.consented !== "boolean" ||
    textVersion.length < 1 || textVersion.length > 60
  ) {
    return { ok: false, error: "invalid_consent_input" }
  }
  return { ok: true, value: { organizationId: input.organizationId, consented: input.consented, source: allowedSource, textVersion } }
}

/** RPC 오류 → 계약 오류. 원문은 넘기지 않는다. */
export const toMarketingConsentError = (message: string | null | undefined): MarketingConsentErrorCode => {
  const known: MarketingConsentErrorCode[] = ["parent_required", "invalid_consent_source", "invalid_consent_input", "organization_not_found"]
  return known.find((code) => message?.includes(code)) ?? "temporarily_unavailable"
}

export const MARKETING_CONSENT_ERROR_STATUS: Record<MarketingConsentErrorCode, number> = {
  invalid_consent_input: 400,
  invalid_consent_source: 400,
  parent_required: 403,
  organization_not_found: 404,
  temporarily_unavailable: 503
}
