"use server"

import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getPublicEnv } from "@/shared/config/env"

export type StudioSignInActionState = {
  status: "idle" | "error" | "success"
  message: string
  redirectTo?: string
}

const defaultState: StudioSignInActionState = {
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

const validateSignInForm = (formData: FormData) => {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !email.includes("@")) {
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (!password) {
    return { ok: false as const, message: "비밀번호를 입력해 주세요." }
  }

  return { ok: true as const, email, password }
}

const formatSupabaseError = (error: { message: string; code?: string } | null) => {
  if (!error) {
    return ""
  }

  const code = typeof error.code === "string" && error.code.length > 0 ? ` (${error.code})` : ""
  return `${error.message}${code}`
}

const isEmailNotConfirmedError = (error: { message?: string; code?: string } | null) => {
  if (!error) {
    return false
  }

  const message = error.message?.toLowerCase() ?? ""
  return error.code === "email_not_confirmed" || message.includes("email not confirmed")
}

const isInvalidCredentialsError = (error: { message?: string; code?: string } | null) => {
  if (!error) {
    return false
  }

  const message = error.message?.toLowerCase() ?? ""
  return error.code === "invalid_credentials" || message.includes("invalid login credentials")
}

const resolveStudioSignInErrorMessage = (error: { message?: string; code?: string } | null) => {
  if (isEmailNotConfirmedError(error)) {
    return "이메일 확인 상태를 준비 중입니다. 승인 대기 계정이거나 이전 신청 계정일 수 있으니 다시 시도해 주세요."
  }

  if (isInvalidCredentialsError(error)) {
    return "학원 계정의 이메일 또는 비밀번호를 확인해 주세요."
  }

  return "studio 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
}

const confirmAcademySignupUserIfNeeded = async (email: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("teacher_signup_requests")
    .select("user_id, status")
    .eq("signup_email", email)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data?.user_id) {
    return false
  }

  const { error: confirmError } = await serviceRoleClient.auth.admin.updateUserById(data.user_id, {
    email_confirm: true
  })

  return !confirmError
}

export async function studioSignInAction(
  previousState: StudioSignInActionState = defaultState,
  formData: FormData
): Promise<StudioSignInActionState> {
  void previousState

  const returnTo = resolveSafeReturnTo(formData) ?? "/studio"
  const validated = validateSignInForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  let signInResult = await supabase.auth.signInWithPassword({
    email: validated.email,
    password: validated.password
  })

  if (isEmailNotConfirmedError(signInResult.error)) {
    const didConfirm = await confirmAcademySignupUserIfNeeded(validated.email)
    if (didConfirm) {
      signInResult = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password
      })
    }
  }

  const { data, error } = signInResult

  if (error || !data.user || !data.session?.access_token) {
    return {
      status: "error",
      message: resolveStudioSignInErrorMessage(error)
    }
  }

  const tokenClient = createClient(getPublicEnv().supabaseUrl, getPublicEnv().supabasePublishableKey, {
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`
      }
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })

  const { data: profile, error: profileError } = await tokenClient
    .from("profiles")
    .select("id, role, organization_id")
    .eq("id", data.user.id)
    .maybeSingle()

  if (profileError) {
    await supabase.auth.signOut()
    const adapterMode = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock(default)"
    return {
      status: "error",
      message: `studio 프로필 조회 실패: ${formatSupabaseError(profileError)} (data_source=${adapterMode})`
    }
  }

  if (!profile) {
    const { data: pendingRequest, error: pendingError } = await tokenClient
      .from("teacher_signup_requests")
      .select("status")
      .eq("user_id", data.user.id)
      .in("status", ["pending", "rejected"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pendingError) {
      await supabase.auth.signOut()
      return {
        status: "error",
        message: `가입 신청 상태를 확인하지 못했습니다: ${formatSupabaseError(pendingError)}`
      }
    }

    if (pendingRequest) {
      redirect("/studio/pending")
    }

    await supabase.auth.signOut()
    return {
      status: "error",
      message: "등록된 학원 계정이 아닙니다. 가입을 먼저 진행해 주세요."
    }
  }

  const normalizedRole =
    profile.role === "teacher" || profile.role === "academy"
      ? "academy"
      : profile.role === "operator" || profile.role === "admin"
        ? "admin"
        : null

  if (!normalizedRole || !profile.organization_id) {
    await supabase.auth.signOut()
    return {
      status: "error",
      message: !profile.organization_id
        ? "studio 프로필에 organization_id가 없습니다. 승인/연결 상태를 확인해 주세요."
        : "studio 프로필의 role이 올바르지 않습니다. 승인/권한 상태를 확인해 주세요."
    }
  }

  // 로그인 판단은 여기까지다: 인증 성공 + profile 존재 + Studio 허용 role + organization.
  // teachers 매핑 존재 여부는 검사하지 않는다. 강사 명부는 로그인 계정과 별개 개념이고,
  // 신규 승인 학원은 명부가 비어 있는 상태로 시작한다.
  // 이후 화면별 권한은 requireTeacherStudioAccess 가 같은 기준으로 다시 판단한다.
  redirect(returnTo)
}
