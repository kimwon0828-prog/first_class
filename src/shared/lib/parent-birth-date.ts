export const MIN_PARENT_BIRTH_DATE = "1900-01-01"
export const MIN_PARENT_SIGN_UP_AGE = 14

export const UNDERAGE_PARENT_SIGN_UP_MESSAGE =
  "첫수업은 만 14세 이상부터 가입할 수 있습니다. 만 14세 미만 사용자는 보호자 계정으로 이용해 주세요."

export const getTodayDateValue = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const getMinimumAllowedBirthDate = () => {
  const today = new Date()
  const minimumDate = new Date(today.getFullYear() - MIN_PARENT_SIGN_UP_AGE, today.getMonth(), today.getDate())
  const year = minimumDate.getFullYear()
  const month = String(minimumDate.getMonth() + 1).padStart(2, "0")
  const day = String(minimumDate.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

export const validateParentBirthDate = (
  rawValue: FormDataEntryValue | string | null | undefined,
  options?: { required?: boolean }
) => {
  const required = options?.required ?? true
  const parentBirthDate = String(rawValue ?? "").trim()

  if (!parentBirthDate) {
    if (!required) {
      return {
        ok: true as const,
        parentBirthDate: null
      }
    }

    return { ok: false as const, message: "생년월일을 입력해 주세요." }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(parentBirthDate)) {
    return { ok: false as const, message: "생년월일을 YYYY-MM-DD 형식으로 입력해 주세요." }
  }

  const parsed = new Date(`${parentBirthDate}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== parentBirthDate) {
    return { ok: false as const, message: "올바른 생년월일을 입력해 주세요." }
  }

  if (parentBirthDate < MIN_PARENT_BIRTH_DATE) {
    return { ok: false as const, message: "생년월일은 1900-01-01 이후로 입력해 주세요." }
  }

  if (parentBirthDate > getTodayDateValue()) {
    return { ok: false as const, message: "미래 날짜는 생년월일로 입력할 수 없습니다." }
  }

  if (parentBirthDate > getMinimumAllowedBirthDate()) {
    return { ok: false as const, message: UNDERAGE_PARENT_SIGN_UP_MESSAGE }
  }

  return {
    ok: true as const,
    parentBirthDate
  }
}

export const formatParentBirthDateLabel = (value: string | null | undefined) => {
  const normalized = typeof value === "string" ? value.trim() : ""
  if (!normalized) {
    return "미입력"
  }

  return normalized
}
