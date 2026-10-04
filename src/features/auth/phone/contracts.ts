import { normalizePhoneNumber } from "@/features/notifications/sms/phone"
import { safeAuthReturnTo } from "../lib/apple-auth"
export function normalizeParentMobile(value: unknown): string | null {
  if (typeof value !== "string" || !/^[+\d\s()-]+$/.test(value)) return null
  let digits = normalizePhoneNumber(value)
  if (digits?.startsWith("82")) digits = "0" + digits.slice(2)
  return digits && /^010\d{8}$/.test(digits) ? digits : null
}
export function phoneReturnTo(raw?: string | null) { const next = safeAuthReturnTo(raw); return next.startsWith("/auth/") ? "/my" : next }
export function completePhoneHref(next: string) { return `/auth/complete-phone?returnTo=${encodeURIComponent(phoneReturnTo(next))}` }
export const PHONE_MESSAGES: Record<string, string> = {
  sent: "인증번호를 보냈어요.", verified: "휴대폰 인증이 완료됐어요.",
  invalid_phone: "010으로 시작하는 휴대폰 번호를 입력해 주세요.", invalid_code: "인증번호가 올바르지 않아요.",
  expired: "인증번호가 만료됐어요. 다시 받아주세요.", attempts_exceeded: "시도 횟수를 초과했어요. 인증번호를 다시 받아주세요.",
  cooldown: "잠시 후 인증번호를 다시 받을 수 있어요.", rate_limited: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
  duplicate_phone: "이미 첫수업에 가입된 휴대폰 번호예요.", used: "이미 사용했거나 새로 발급된 인증번호예요.",
  unavailable: "휴대폰 인증을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.", unauthorized: "다시 로그인해 주세요."
}
