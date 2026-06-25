const toDigits = (value: string) => value.replace(/\D/g, "")

export const normalizePhoneNumber = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const digits = toDigits(value.trim())
  if (digits.length < 9) {
    return null
  }

  return digits
}

export const maskPhoneNumber = (value: string | null | undefined): string | null => {
  const normalized = normalizePhoneNumber(value)
  if (!normalized) {
    return null
  }

  if (normalized.length === 11) {
    return `${normalized.slice(0, 3)}-****-${normalized.slice(-4)}`
  }

  if (normalized.length === 10) {
    return `${normalized.slice(0, 3)}-***-${normalized.slice(-4)}`
  }

  if (normalized.length > 7) {
    return `${normalized.slice(0, 3)}-${"*".repeat(normalized.length - 7)}-${normalized.slice(-4)}`
  }

  return `${normalized.slice(0, 2)}${"*".repeat(Math.max(normalized.length - 4, 1))}${normalized.slice(-2)}`
}
