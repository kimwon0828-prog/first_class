"use server"

import { ensureParentProfile } from "@/features/auth/lib/profile-sync"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type SignUpActionState = {
  status: "idle" | "error" | "needs_email_confirm" | "success"
  message: string
  redirectTo?: string
}

const defaultState: SignUpActionState = {
  status: "idle",
  message: ""
}

const MIN_PARENT_BIRTH_DATE = "1900-01-01"

const getTodayDateValue = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, "0")
  const day = String(today.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

const validateParentBirthDate = (rawValue: FormDataEntryValue | null) => {
  const parentBirthDate = String(rawValue ?? "").trim()

  if (!parentBirthDate) {
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

  return {
    ok: true as const,
    parentBirthDate
  }
}

const resolveSafeReturnTo = (formData: FormData): string | null => {
  const raw = String(formData.get("returnTo") ?? "").trim()
  if (!raw) {
    return null
  }

  if (!raw.startsWith("/") || raw.startsWith("//")) {
    return null
  }

  return raw
}

const validateSignUpForm = (formData: FormData) => {
  const name = String(formData.get("name") ?? "").trim()
  const phoneRaw = String(formData.get("phone") ?? "").trim()
  const phone = phoneRaw.length > 0 ? phoneRaw : null
  const parentBirthDateResult = validateParentBirthDate(formData.get("parentBirthDate"))
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "")
  const termsAgreed = String(formData.get("termsAgreed") ?? "") === "yes"
  const privacyAgreed = String(formData.get("privacyAgreed") ?? "") === "yes"
  const thirdPartyAgreed = String(formData.get("thirdPartyAgreed") ?? "") === "yes"

  if (!name || name.length < 2) {
    return { ok: false as const, message: "보호자명은 2자 이상 입력해 주세요." }
  }

  if (!phone || phone.length < 8) {
    return { ok: false as const, message: "보호자 연락처를 올바르게 입력해 주세요." }
  }

  if (!parentBirthDateResult.ok) {
    return parentBirthDateResult
  }

  if (!email || !email.includes("@")) {
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (password.length < 8) {
    return { ok: false as const, message: "비밀번호는 8자 이상이어야 합니다." }
  }

  if (password !== passwordConfirm) {
    return { ok: false as const, message: "비밀번호 확인이 일치하지 않습니다." }
  }

  if (!termsAgreed || !privacyAgreed || !thirdPartyAgreed) {
    return { ok: false as const, message: "필수 약관에 모두 동의해주세요." }
  }

  return {
    ok: true as const,
    name,
    phone,
    parentBirthDate: parentBirthDateResult.parentBirthDate,
    email,
    password
  }
}

export async function signUpParentAction(
  previousState: SignUpActionState = defaultState,
  formData: FormData
): Promise<SignUpActionState> {
  void previousState
  const returnTo = resolveSafeReturnTo(formData)
  const validated = validateSignUpForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: {
        name: validated.name,
        phone: validated.phone,
        parent_birth_date: validated.parentBirthDate,
        signup_intent: "parent_public",
        role: "parent"
      }
    }
  })

  if (error) {
    return {
      status: "error",
      message: "회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (!data.session) {
    return {
      status: "needs_email_confirm",
      message: "이메일 인증 후 로그인해 주세요. 첫 로그인 시 프로필이 자동으로 생성됩니다."
    }
  }

  const profile = await ensureParentProfile({
    allowCreateParentIfMissing: true,
    preferredName: validated.name,
    preferredPhone: validated.phone,
    preferredParentBirthDate: validated.parentBirthDate
  })

  if (!profile) {
    return {
      status: "error",
      message: "가입은 완료되었지만 프로필 동기화에 실패했습니다. 다시 로그인해 주세요."
    }
  }

  if (profile.role !== "parent") {
    return {
      status: "error",
      message: "공개 회원가입은 학부모(parent) 계정만 지원합니다."
    }
  }

  return {
    status: "success",
    message: "회원가입이 완료되었습니다.",
    redirectTo: returnTo ?? resolvePostAuthRedirect(profile.role)
  }
}
