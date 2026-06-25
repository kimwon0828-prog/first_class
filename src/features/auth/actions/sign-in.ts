"use server"

import { createClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { ensureParentProfile, normalizeProfileRole } from "@/features/auth/lib/profile-sync"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { getPublicEnv } from "@/shared/config/env"

export type SignInActionState = {
  status: "idle" | "error" | "success"
  message: string
  redirectTo?: string
}

const defaultState: SignInActionState = {
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

const isEmailNotConfirmedError = (error: { message?: string | null; code?: string | null } | null) => {
  if (!error) {
    return false
  }

  const message = error.message?.toLowerCase() ?? ""
  return error.code === "email_not_confirmed" || message.includes("email not confirmed")
}

const isInvalidCredentialsError = (error: { message?: string | null; code?: string | null } | null) => {
  if (!error) {
    return false
  }

  const message = error.message?.toLowerCase() ?? ""
  return error.code === "invalid_credentials" || message.includes("invalid login credentials")
}

const resolveParentSignInErrorMessage = (
  error: { message?: string | null; code?: string | null } | null
) => {
  if (isEmailNotConfirmedError(error)) {
    return "이메일 인증 후 로그인해 주세요."
  }

  if (isInvalidCredentialsError(error)) {
    return "이메일 또는 비밀번호를 확인해 주세요."
  }

  return "로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
}

export async function signInAction(
  previousState: SignInActionState = defaultState,
  formData: FormData
): Promise<SignInActionState> {
  void previousState
  const returnTo = resolveSafeReturnTo(formData)
  const validated = validateSignInForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: validated.email,
    password: validated.password
  })

  if (error || !data.user || !data.session?.access_token) {
    return { status: "error", message: resolveParentSignInErrorMessage(error) }
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

  const { data: existingProfile, error: existingProfileError } = await tokenClient
    .from("profiles")
    .select("id, role, name, phone")
    .eq("id", data.user.id)
    .maybeSingle()

  if (existingProfileError) {
    await supabase.auth.signOut()
    return {
      status: "error",
      message: `프로필 조회 실패: ${existingProfileError.message}`
    }
  }

  if (existingProfile) {
    const phoneFromMetadata =
      typeof data.user.user_metadata?.phone === "string" && data.user.user_metadata.phone.trim()
        ? data.user.user_metadata.phone.trim()
        : null
    if (!existingProfile.phone && phoneFromMetadata) {
      await tokenClient
        .from("profiles")
        .update({
          phone: phoneFromMetadata,
          updated_at: new Date().toISOString()
        })
        .eq("id", data.user.id)
    }

    const normalizedRole = normalizeProfileRole(existingProfile.role)
    if (!normalizedRole) {
      await supabase.auth.signOut()
      return {
        status: "error",
        message: "프로필 권한 정보를 확인할 수 없습니다. 관리자에게 문의해 주세요."
      }
    }

    redirect(returnTo ?? resolvePostAuthRedirect(normalizedRole.role))
  }

  const metadataRole = data.user.user_metadata?.role
  const signupIntent = data.user.user_metadata?.signup_intent
  const isExplicitTeacherMetadata =
    metadataRole === "teacher" ||
    signupIntent === "teacher_invite" ||
    signupIntent === "staff_invite" ||
    signupIntent === "teacher_public"

  if (isExplicitTeacherMetadata) {
    await supabase.auth.signOut()
    return {
      status: "error",
      message:
        "선생님 계정은 studio에서 로그인해 주세요. 승인 대기 중이면 studio 로그인 후 안내를 확인할 수 있습니다."
    }
  }

  const fallbackName =
    typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name.trim()
      ? data.user.user_metadata.name.trim()
      : data.user.email?.split("@")[0] ?? "학부모"
  const phoneFromMetadata =
    typeof data.user.user_metadata?.phone === "string" && data.user.user_metadata.phone.trim()
      ? data.user.user_metadata.phone.trim()
      : null

  const { error: insertError } = await tokenClient.from("profiles").insert({
    id: data.user.id,
    role: "parent",
    name: fallbackName.slice(0, 30),
    phone: phoneFromMetadata,
    organization_id: null
  })

  if (insertError && insertError.code !== "23505") {
    await supabase.auth.signOut()
    return {
      status: "error",
      message: `프로필 생성 실패: ${insertError.message}`
    }
  }

  const { data: syncedProfile, error: syncedProfileError } = await tokenClient
    .from("profiles")
    .select("id, role, name")
    .eq("id", data.user.id)
    .maybeSingle()

  if (syncedProfileError) {
    await supabase.auth.signOut()
    return {
      status: "error",
      message: `프로필 재조회 실패: ${syncedProfileError.message}`
    }
  }

  if (!syncedProfile || syncedProfile.role !== "parent") {
    await supabase.auth.signOut()
    return {
      status: "error",
      message:
        "프로필 정보가 없어 로그인할 수 없습니다. teacher 계정은 초대/수동 생성된 계정만 사용할 수 있습니다."
    }
  }

  redirect(returnTo ?? resolvePostAuthRedirect(syncedProfile.role))
}

export async function ensureParentProfileAfterAuthAction(
  preferredName?: string,
  preferredPhone?: string | null
): Promise<{
  ok: boolean
  role: "parent" | "academy" | "admin" | null
  message?: string
}> {
  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { user },
      error: userError
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return { ok: false, role: null, message: userError?.message ?? "no_user" }
    }

    const metadataRole = user.user_metadata?.role
    const signupIntent = user.user_metadata?.signup_intent
    const isExplicitTeacherMetadata =
      metadataRole === "teacher" ||
      signupIntent === "teacher_invite" ||
      signupIntent === "staff_invite" ||
      signupIntent === "teacher_public"
    if (isExplicitTeacherMetadata) {
      return { ok: true, role: "academy" }
    }

    const profile = await ensureParentProfile({
      allowCreateParentIfMissing: true,
      preferredName,
      preferredPhone
    })

    if (!profile) {
      return { ok: false, role: null, message: "failed_to_sync_profile" }
    }

    return { ok: true, role: profile.role }
  } catch (error) {
    return { ok: false, role: null, message: error instanceof Error ? error.message : "unknown_error" }
  }
}
