// 수신 동의 · 철회 처리 결과 알림(정보통신망법 제50조 제7항). 광고가 아닌 서비스 문자다.
// 학부모가 학원 안내 문자에 동의하거나 철회하면 그 학부모 휴대폰으로 한 통 보낸다.
// 같은 값을 다시 요청한 경우(상태가 그대로)는 보내지 않는다.

import { getSeoulDateTimeParts } from "@/shared/lib/seoul-datetime"

export type MarketingConsentNoticeAction = "consent" | "withdraw"

/** 알림 한 통의 입력. at = RPC 가 돌려준 동의 · 철회 시각(문자에 날짜로 적는다). */
export type MarketingConsentChange = { parentId: string; organizationId: string; action: MarketingConsentNoticeAction; at: Date }

export const toMarketingConsentChange = (
  parentId: string,
  item: { organizationId: string; consented: boolean; consentedAt: string | null; withdrawnAt: string | null }
): MarketingConsentChange => ({
  parentId,
  organizationId: item.organizationId,
  action: item.consented ? "consent" : "withdraw",
  at: new Date((item.consented ? item.consentedAt : item.withdrawnAt) ?? Date.now())
})

/**
 * 상태가 실제로 바뀌었는가. previous: 이전 동의 값, null = 이전 행 없음("동의 안 함"으로 본다 —
 * 처음 보낸 철회는 바뀐 것이 아니다). 이전 상태를 읽지 못했으면 부르는 쪽이 보내지 않는다.
 */
export const isMarketingConsentChange = (previous: boolean | null, next: boolean) => (previous ?? false) !== next

/** "2026년 10월 24일" (KST). */
export const formatConsentNoticeDate = (at: Date) => {
  const parts = getSeoulDateTimeParts(at.toISOString())
  return parts ? `${parts.year}년 ${parts.month}월 ${parts.day}일` : ""
}

/**
 * 알림 문구. academyName 이 null 이면 080 무료수신거부(모든 학원 안내에서 빠진다)다.
 * "마이 › 학원 안내 문자"의 ›는 문자(EUC-KR)로 보낼 수 없어 >로 쓴다.
 */
export const buildMarketingConsentNotice = (input: {
  action: MarketingConsentNoticeAction
  academyName: string | null
  at: Date
}) => {
  const date = formatConsentNoticeDate(input.at)
  const name = input.academyName?.trim()
  if (!name) {
    return `[첫수업] 학원 안내 문자 수신을 거부했어요(${date}). 앞으로 첫수업을 통한 학원 안내 문자는 보내지 않아요.`
  }
  return input.action === "consent"
    ? `[첫수업] ${name} 안내 문자 수신에 동의했어요(${date}). 마이 > 학원 안내 문자에서 언제든 끌 수 있어요.`
    : `[첫수업] ${name} 안내 문자 수신을 거부했어요(${date}). 앞으로 이 학원의 안내 문자는 보내지 않아요.`
}
