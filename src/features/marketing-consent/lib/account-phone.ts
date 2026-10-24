// 학부모 계정 번호(20261025120000). 안내 문자 · 동의 처리 결과 알림 · 080 처리 결과 알림이 모두 이 번호로 간다.
// SQL app.recontact_account_phone 과 같은 규칙: 숫자만, +82 10 → 010, 010 휴대폰만.

export const toAccountPhone = (raw: string | null | undefined): string | null => {
  const digits = (raw ?? "").replace(/\D/g, "")
  const normalized = /^8210\d{8}$/.test(digits) ? `0${digits.slice(2)}` : digits
  return /^010\d{8}$/.test(normalized) ? normalized : null
}

/** "010-****-1234" — 기록 · 화면용. */
export const maskAccountPhone = (phone: string) => `${phone.slice(0, 3)}-****-${phone.slice(-4)}`
