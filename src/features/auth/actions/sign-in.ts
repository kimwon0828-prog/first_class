"use server"

import { createClient } from "@supabase/supabase-js"

import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
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

export async function signInAction(
  previousState: SignInActionState = defaultState,
  formData: FormData
): Promise<SignInActionState> {
  try {
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

    if (error || !data.user) {
      return { status: "error", message: "이메일 또는 비밀번호를 확인해 주세요." }
    }

    const tokenClient =
      data.session?.access_token != null
        ? createClient(getPublicEnv().supabaseUrl, getPublicEnv().supabasePublishableKey, {
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
        : supabase

    const { data: existingProfile, error: existingProfileError } = await tokenClient
      .from("profiles")
      .select("id, role, name")
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
      return {
        status: "success",
        message: "로그인되었습니다.",
        redirectTo: returnTo ?? resolvePostAuthRedirect(existingProfile.role)
      }
    }

    const metadataRole = data.user.user_metadata?.role
    const signupIntent = data.user.user_metadata?.signup_intent
    const isExplicitTeacherMetadata =
      metadataRole === "teacher" ||
      signupIntent === "teacher_invite" ||
      signupIntent === "staff_invite"

    if (isExplicitTeacherMetadata) {
      await supabase.auth.signOut()
      return {
        status: "error",
        message:
          "teacher 계정은 공개 회원가입을 지원하지 않습니다. 초대/수동 생성된 계정으로 로그인해 주세요."
      }
    }

    const fallbackName =
      typeof data.user.user_metadata?.name === "string" && data.user.user_metadata.name.trim()
        ? data.user.user_metadata.name.trim()
        : data.user.email?.split("@")[0] ?? "학부모"

    const { error: insertError } = await tokenClient.from("profiles").insert({
      id: data.user.id,
      role: "parent",
      name: fallbackName.slice(0, 30),
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

    return {
      status: "success",
      message: "로그인되었습니다.",
      redirectTo: returnTo ?? resolvePostAuthRedirect(syncedProfile.role)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
    return {
      status: "error",
      message: `로그인 처리 중 오류: ${message}`
    }
  }
}
