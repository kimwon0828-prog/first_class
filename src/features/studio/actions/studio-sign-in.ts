"use server"

import { createClient } from "@supabase/supabase-js"

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

  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.auth.signInWithPassword({
      email: validated.email,
      password: validated.password
    })

    if (error || !data.user || !data.session?.access_token) {
      return {
        status: "error",
        message: "학원 계정의 이메일 또는 비밀번호를 확인해 주세요."
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
        .eq("status", "pending")
        .maybeSingle()

      if (pendingError) {
        await supabase.auth.signOut()
        return {
          status: "error",
          message: `가입 신청 상태를 확인하지 못했습니다: ${formatSupabaseError(pendingError)}`
        }
      }

      if (pendingRequest) {
        return {
          status: "success",
          message: "승인 대기 중인 계정입니다.",
          redirectTo: "/studio/pending"
        }
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

    if (normalizedRole === "academy") {
      const { data: teacherRow, error: teacherError } = await tokenClient
        .from("teachers")
        .select("id")
        .eq("profile_id", data.user.id)
        .maybeSingle()

      if (teacherError) {
        await supabase.auth.signOut()
        return {
          status: "error",
          message: `teachers 매핑을 확인하지 못했습니다: ${formatSupabaseError(teacherError)}`
        }
      }

      if (!teacherRow) {
        await supabase.auth.signOut()
        return {
          status: "error",
          message:
            "teachers 매핑이 없습니다. 승인 처리 시 teachers.profile_id 연결이 생성되었는지 확인해 주세요."
        }
      }
    }

    return {
      status: "success",
      message: "studio에 로그인했습니다.",
      redirectTo: returnTo
    }
  } catch {
    return {
      status: "error",
      message: "studio 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
    }
  }
}
