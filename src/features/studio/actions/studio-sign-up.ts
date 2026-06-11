"use server"

import { isAcademyArea } from "@/shared/config/academy-areas"
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
  const organizationName = String(formData.get("organizationName") ?? "").trim()
  const academyArea = String(formData.get("academyArea") ?? "").trim()
  const branchName = String(formData.get("branchName") ?? "").trim()
  const address = String(formData.get("address") ?? "").trim()
  const addressDetail = String(formData.get("addressDetail") ?? "").trim()
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!organizationName) {
    return { ok: false as const, message: "학원명을 입력해 주세요." }
  }

  if (!isAcademyArea(academyArea)) {
    return { ok: false as const, message: "학원가를 선택해 주세요." }
  }

  if (!address) {
    return { ok: false as const, message: "학원 주소를 입력해 주세요." }
  }

  if (!email || !email.includes("@")) {
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (password.length < 8) {
    return { ok: false as const, message: "비밀번호는 8자 이상이어야 합니다." }
  }

  return {
    ok: true as const,
    organizationName,
    academyArea,
    branchName: branchName || null,
    address,
    addressDetail: addressDetail || null,
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
  const fallbackTeacherName = `${validated.organizationName} 관리자`
  
  // teacher_signup_requests is created by DB trigger on auth.users.
  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: {
        signup_intent: "teacher_public",
        role: "teacher",
        name: fallbackTeacherName,
        teacher_name: fallbackTeacherName,
        teacher_phone: null,
        organization_name: validated.organizationName,
        academy_area: validated.academyArea,
        branch_name: validated.branchName,
        address: validated.address,
        address_detail: validated.addressDetail,
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
      message: "이메일 인증 후 로그인해 주세요. 학원 계정 승인 대기 상태로 접수됩니다."
    }
  }

  return {
    status: "success",
    message: "학원 계정 신청이 완료되었습니다."
  }
}
