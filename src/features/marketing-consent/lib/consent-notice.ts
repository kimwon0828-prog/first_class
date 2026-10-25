// 학원 소식 수신 동의 · 철회 처리 결과 알림(정보통신망법 제50조 제7항). 광고가 아닌 서비스 문자다.
// 학부모가 동의하거나 철회하면(앱 · 웹 · 080) 그 학부모 휴대폰으로 한 통 보낸다.
// 앱 · 웹은 상태가 실제로 바뀐 경우만 보낸다 — 판정은 RPC set_my_academy_news_consent 의 changed(20261026120000).

import type { MarketingConsentState } from "@/features/marketing-consent/lib/marketing-consent"
import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

export type MarketingConsentNoticeAction = "consent" | "withdraw"

/** 알림 한 통의 입력. at = RPC 가 돌려준 동의 · 철회 시각(문자에 날짜로 적는다). */
export type MarketingConsentChange = {
  parentId: string
  action: MarketingConsentNoticeAction
  source: "parent_app" | "parent_web"
  at: Date
}

export const toMarketingConsentChange = (
  parentId: string,
  source: MarketingConsentChange["source"],
  state: MarketingConsentState
): MarketingConsentChange => ({
  parentId,
  action: state.consented ? "consent" : "withdraw",
  source,
  at: new Date((state.consented ? state.consentedAt : state.withdrawnAt) ?? Date.now())
})

/** "2026년 10월 24일" (KST). */
export const formatConsentNoticeDate = (at: Date) => {
  const parts = getSeoulDateTimeParts(at.toISOString())
  return parts ? `${parts.year}년 ${parts.month}월 ${parts.day}일` : ""
}

/**
 * 알림 문구. 080 무료수신거부도 철회 문구와 같다.
 * "마이 › 학원 소식"의 ›는 문자(EUC-KR)로 보낼 수 없어 >로 쓴다.
 */
export const buildMarketingConsentNotice = (input: { action: MarketingConsentNoticeAction; at: Date }) => {
  const date = formatConsentNoticeDate(input.at)
  return input.action === "consent"
    ? `[첫수업] 학원 소식 수신에 동의했어요(${date}). 마이 > 학원 소식에서 언제든 끌 수 있어요.`
    : `[첫수업] 학원 소식 수신을 거부했어요(${date}). 앞으로 학원 소식 문자는 보내지 않아요.`
}
