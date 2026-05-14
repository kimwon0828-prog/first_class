"use server"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type StudioSignUpActionState = {
  status: "idle" | "error" | "needs_email_confirm" | "success"
  message: string
}

const defaultState: StudioSignUpActionState = {
  status: "idle",
  message: ""
}

const validateSignUpForm = (formData: FormData) => {
  const teacherName = String(formData.get("teacherName") ?? "").trim()
  const teacherPhone = String(formData.get("teacherPhone") ?? "").trim()
  const organizationName = String(formData.get("organizationName") ?? "").trim()
  const branchName = String(formData.get("branchName") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!teacherName || teacherName.length < 2) {
    return { ok: false as const, message: "선생님 이름은 2자 이상 입력해 주세요." }
  }

  if (!organizationName) {
    return { ok: false as const, message: "학원/조직 이름을 입력해 주세요." }
  }

  if (!email || !email.includes("@")) {
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (password.length < 8) {
    return { ok: false as const, message: "비밀번호는 8자 이상이어야 합니다." }
  }

  return {
    ok: true as const,
    teacherName,
    teacherPhone: teacherPhone || null,
    organizationName,
    branchName: branchName || null,
    email,
    password
  }
}

export async function studioSignUpAction(
  previousState: StudioSignUpActionState = defaultState,
  formData: FormData
): Promise<StudioSignUpActionState> {
  void previousState
  const validated = validateSignUpForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  
  // Create auth user. teacher_signup_requests is created by DB trigger on auth.users.
  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: {
        signup_intent: "teacher_public",
        role: "teacher",
        name: validated.teacherName,
        teacher_name: validated.teacherName,
        teacher_phone: validated.teacherPhone,
        organization_name: validated.organizationName,
        branch_name: validated.branchName,
        organization_phone: null,
        request_note: null
      }
    }
  })

  if (error) {
    if (error.message.includes("User already registered")) {
      return { status: "error", message: "이미 가입된 이메일입니다." }
    }
    return {
      status: "error",
      message: "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (!data.user) {
    return {
      status: "error",
      message: "계정을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (!data.session) {
    return {
      status: "needs_email_confirm",
      message: "이메일 인증 후 로그인해 주세요. 승인 대기 상태로 접수됩니다."
    }
  }

  return {
    status: "success",
    message: "가입 신청이 완료되었습니다."
  }
}
