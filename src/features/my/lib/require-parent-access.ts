"use server"

import { redirect } from "next/navigation"

import { getSupabaseServerClient, getUserFromSupabaseAuthCookieFallback } from "@/integrations/supabase/server"

type RequireParentAccessOptions = {
  returnTo: string
}

type ParentAccessState =
  | {
      status: "ok"
      currentPath: string
      userId: string
      profile: {
        id: string
        role: "parent"
        name: string
        phone: string | null
      }
    }
  | {
      status: "no_user"
      currentPath: string
      userId: null
      userError: string | null
    }
  | {
      status: "profile_error"
      currentPath: string
      userId: string
      profileError: string
      profileErrorCode: string | null
    }
  | {
      status: "role_mismatch"
      currentPath: string
      userId: string
      profileRole: string | null
    }

const getFallbackName = (email: string | undefined): string => {
  if (!email) {
    return "학부모"
  }

  const localPart = email.split("@")[0]?.trim()
  if (!localPart) {
    return "학부모"
  }

  return localPart.slice(0, 30)
}

export const getParentAccessState = async (currentPath: string): Promise<ParentAccessState> => {
  const supabase = await getSupabaseServerClient()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[parent access session debug]", {
      currentPath,
      hasSession: Boolean(sessionData.session),
      sessionError: sessionError?.message ?? null
    })
  }

  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  const shouldTryFallback =
    !sessionData.session &&
    (!user ||
      (typeof userError?.message === "string" && userError.message.toLowerCase().includes("auth session missing")))

  if (shouldTryFallback) {
    const fallback = await getUserFromSupabaseAuthCookieFallback()
    if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
      console.log("[parent auth fallback debug]", {
        currentPath,
        hasSession: Boolean(sessionData.session),
        userError: userError?.message ?? null,
        hasAuthCookie: fallback.hasAuthCookie,
        hasAccessToken: fallback.hasAccessToken,
        fallbackUserId: fallback.user?.id ?? null
      })
    }

    if (fallback.user) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, name, phone")
        .eq("id", fallback.user.id)
        .maybeSingle()

      if (profileError) {
        return {
          status: "profile_error",
          currentPath,
          userId: fallback.user.id,
          profileError: profileError.message,
          profileErrorCode: typeof (profileError as { code?: unknown }).code === "string" ? (profileError as { code: string }).code : null
        }
      }

      const profileRole = profile?.role != null ? String(profile.role) : null
      if (!profile || profileRole !== "parent") {
        return {
          status: "role_mismatch",
          currentPath,
          userId: fallback.user.id,
          profileRole
        }
      }

      const rawName = typeof profile.name === "string" ? profile.name.trim() : ""
      const name = rawName || getFallbackName(fallback.user.email)
      const phone = typeof profile.phone === "string" && profile.phone.trim().length > 0 ? profile.phone.trim() : null

      return {
        status: "ok",
        currentPath,
        userId: fallback.user.id,
        profile: {
          id: profile.id,
          role: "parent",
          name,
          phone
        }
      }
    }
  }

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[requireParentAccess] getUser", {
      currentPath,
      userId: user?.id ?? null,
      userError: userError?.message ?? null
    })
  }

  if (userError || !user) {
    return {
      status: "no_user",
      currentPath,
      userId: null,
      userError: userError?.message ?? null
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, name, phone")
    .eq("id", user.id)
    .maybeSingle()

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[requireParentAccess] profile", {
      currentPath,
      userId: user.id,
      role: (profile as { role?: unknown } | null)?.role ?? null,
      profileError: profileError?.message ?? null
    })
  }

  if (profileError) {
    return {
      status: "profile_error",
      currentPath,
      userId: user.id,
      profileError: profileError.message,
      profileErrorCode: typeof (profileError as { code?: unknown }).code === "string" ? (profileError as { code: string }).code : null
    }
  }

  const profileRole = profile?.role != null ? String(profile.role) : null
  if (!profile || profileRole !== "parent") {
    return {
      status: "role_mismatch",
      currentPath,
      userId: user.id,
      profileRole
    }
  }

  const rawName = typeof profile.name === "string" ? profile.name.trim() : ""
  const name = rawName || getFallbackName(user.email)
  const phone = typeof profile.phone === "string" && profile.phone.trim().length > 0 ? profile.phone.trim() : null

  return {
    status: "ok",
    currentPath,
    userId: user.id,
    profile: {
      id: profile.id,
      role: "parent",
      name,
      phone
    }
  }
}

export const requireParentAccess = async ({ returnTo }: RequireParentAccessOptions) => {
  const state = await getParentAccessState(returnTo)

  if (state.status === "no_user") {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  }

  if (state.status === "profile_error") {
    redirect("/classes")
  }

  if (state.status === "role_mismatch") {
    redirect("/studio")
  }

  return state.profile
}
