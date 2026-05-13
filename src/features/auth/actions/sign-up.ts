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
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!name || name.length < 2) {
    return { ok: false as const, message: "이름은 2자 이상 입력해 주세요." }
  }

  if (!email || !email.includes("@")) {
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (password.length < 8) {
    return { ok: false as const, message: "비밀번호는 8자 이상이어야 합니다." }
  }

  return { ok: true as const, name, email, password }
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
    preferredName: validated.name
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
