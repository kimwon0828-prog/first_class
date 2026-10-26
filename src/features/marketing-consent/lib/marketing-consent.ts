// 학원 소식(광고성 문자) 수신 동의 — 학부모 앱 · 웹 공용 계약.
// 보내는 주체는 첫수업이고, 동의도 첫수업 하나에 받는다(학원마다가 아니다, 20261026120000).
// 학부모 본인만 바꾼다. 서버(RPC set_my_academy_news_consent)가 auth.uid() 로 판단하므로 요청 본문에 학부모 id 를 받지 않는다.

/** 동의 화면 문구 버전. 학부모 앱(firstsuup-mobile)과 같은 값. 문구를 바꾸면 값을 바꾼다(서버는 기록만 한다). */
export const MARKETING_CONSENT_TEXT_VERSION = "firstsuup-academy-news-2026-10"
/** 화면 문구(앱 src/data/marketing-consent.ts 와 같다). 바꾸면 위 버전도 바꾼다. */
export const MARKETING_CONSENT_LABEL = "첫수업 학원 소식 받기 (광고)"
export const MARKETING_CONSENT_HELP = "체험한 학원에 새 반·특강이 열리면 첫수업이 문자로 알려드려요. 마이 › 학원 소식에서 언제든 끌 수 있어요."

export type MarketingConsentSource = "parent_app" | "parent_web"

export type MarketingConsentInput = {
  consented: boolean
  source: MarketingConsentSource
  textVersion: string
}

/** 응답 모양(GET · POST 같다). 기록이 없으면 consented false, 두 시각 null. */
export type MarketingConsentState = {
  consented: boolean
  consentedAt: string | null
  withdrawnAt: string | null
}

export const EMPTY_MARKETING_CONSENT: MarketingConsentState = { consented: false, consentedAt: null, withdrawnAt: null }

export type MarketingConsentErrorCode =
  | "invalid_consent_input"
  | "invalid_consent_source"
  | "parent_required"
  | "temporarily_unavailable"

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
  if (typeof input.consented !== "boolean" || textVersion.length < 1 || textVersion.length > 60) {
    return { ok: false, error: "invalid_consent_input" }
  }
  return { ok: true, value: { consented: input.consented, source: allowedSource, textVersion } }
}

/** RPC 오류 → 계약 오류. 원문은 넘기지 않는다. */
export const toMarketingConsentError = (message: string | null | undefined): MarketingConsentErrorCode => {
  const known: MarketingConsentErrorCode[] = ["parent_required", "invalid_consent_source", "invalid_consent_input"]
  return known.find((code) => message?.includes(code)) ?? "temporarily_unavailable"
}

export const MARKETING_CONSENT_ERROR_STATUS: Record<MarketingConsentErrorCode, number> = {
  invalid_consent_input: 400,
  invalid_consent_source: 400,
  parent_required: 403,
  temporarily_unavailable: 503
}
