const ACADEMY_NAME_MAX_LENGTH = 100
const PHONE_MAX_LENGTH = 30
const HONEYPOT_MAX_LENGTH = 200
const DUPLICATE_WINDOW_MINUTES = 3

export const PARTNER_INQUIRY_HONEYPOT_FIELD = "website"

export type PartnerInquiryPayload = {
  academyName: string
  phone: string
  privacyAgreed: boolean
  honeypot?: string
}

export type ValidatedPartnerInquiry = {
  academyName: string
  phone: string
  privacyAgreed: true
}

export type PartnerInquiryValidationResult =
  | { ok: true; value: ValidatedPartnerInquiry }
  | { ok: false; message: string }

const compactWhitespace = (value: string) => value.replace(/\s+/g, " ").trim()
const toDigits = (value: string) => value.replace(/\D/g, "")

export const formatKoreanMobilePhone = (value: string | null | undefined): string | null => {
  const digits = typeof value === "string" ? toDigits(value.trim()) : ""
  if (!digits) {
    return null
  }

  if (!/^01[0-9]/.test(digits)) {
    return null
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  return null
}

export const validatePartnerInquiryPayload = (
  payload: PartnerInquiryPayload
): PartnerInquiryValidationResult => {
  const academyName = compactWhitespace(String(payload.academyName ?? ""))
  const phoneRaw = compactWhitespace(String(payload.phone ?? ""))
  const honeypot = String(payload.honeypot ?? "").trim()

  if (honeypot.length > HONEYPOT_MAX_LENGTH) {
    return {
      ok: false,
      message: "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    }
  }

  if (honeypot.length > 0) {
    return {
      ok: false,
      message: "문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
    }
  }

  if (!academyName) {
    return { ok: false, message: "학원명을 입력해주세요." }
  }

  if (academyName.length > ACADEMY_NAME_MAX_LENGTH) {
    return { ok: false, message: "학원명을 입력해주세요." }
  }

  if (!phoneRaw) {
    return { ok: false, message: "연락처를 확인해주세요." }
  }

  if (phoneRaw.length > PHONE_MAX_LENGTH) {
    return { ok: false, message: "연락처를 확인해주세요." }
  }

  const phone = formatKoreanMobilePhone(phoneRaw)
  if (!phone) {
    return { ok: false, message: "연락처를 확인해주세요." }
  }

  if (payload.privacyAgreed !== true) {
    return {
      ok: false,
      message: "이용약관 및 개인정보 처리방침에 동의해주세요."
    }
  }

  return {
    ok: true,
    value: {
      academyName,
      phone,
      privacyAgreed: true
    }
  }
}

export const getPartnerInquiryDuplicateSinceIso = (now = new Date()) =>
  new Date(now.getTime() - DUPLICATE_WINDOW_MINUTES * 60 * 1000).toISOString()
