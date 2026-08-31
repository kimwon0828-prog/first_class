import { cache } from "react"

import { getProfileForUser, type AuthProfile, type AuthUserIdentity } from "@/features/auth/lib/profile-sync"
import { getSupabaseServerClient, getUserFromSupabaseAuthCookieFallback } from "@/integrations/supabase/server"

type CurrentAuthBase = {
  authenticated: boolean
  user: AuthUserIdentity | null
  profile: AuthProfile | null
  isParentUser: boolean
  isStudioUser: boolean
}

export type CurrentAuthState = CurrentAuthBase &
  (
    | {
        status: "ok"
        authenticated: true
        user: AuthUserIdentity
        profile: AuthProfile
      }
    | {
        status: "no_user"
        authenticated: false
        user: null
        profile: null
        userError: string | null
      }
    | {
        status: "profile_error"
        authenticated: true
        user: AuthUserIdentity
        profile: null
        profileError: string
        profileErrorCode: string | null
      }
    | {
        status: "profile_missing"
        authenticated: true
        user: AuthUserIdentity
        profile: null
      }
    | {
        status: "unsupported_role"
        authenticated: true
        user: AuthUserIdentity
        profile: null
        profileRole: string | null
      }
  )

const isStudioProfile = (profile: AuthProfile) =>
  profile.dbRole === "academy" ||
  profile.dbRole === "operator" ||
  profile.dbRole === "admin"

const resolveCurrentAuthCached = cache(async (context: string): Promise<CurrentAuthState> => {
  const supabase = await getSupabaseServerClient()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  // 검증된 identity 만 얻는 용도. asymmetric JWT 를 JWKS 로 로컬 검증하므로 Auth 서버 왕복이 없고,
  // 만료가 임박하면 getUser() 와 동일하게 refresh 를 먼저 수행한다.
  // 권한 판정의 canonical source 는 아래 getProfileForUser 가 읽는 profiles 그대로다.
  const { data: claimsData, error: userError } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const subject = typeof claims?.sub === "string" ? claims.sub : null
  const claimEmail = typeof claims?.email === "string" ? claims.email : undefined

  let user: AuthUserIdentity | null = subject ? { id: subject, email: claimEmail } : null
  let fallback: Awaited<ReturnType<typeof getUserFromSupabaseAuthCookieFallback>> | null = null

  // A raw request cookie can still verify the user when the SSR client cannot read its session consistently.
  if (!user) {
    fallback = await getUserFromSupabaseAuthCookieFallback()
    user = fallback.user
  }

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[current auth resolver]", {
      context,
      hasSession: Boolean(sessionData.session),
      sessionError: sessionError?.message ?? null,
      userError: userError?.message ?? null,
      usedCookieFallback: Boolean(fallback?.user),
      hasAuthCookie: fallback?.hasAuthCookie ?? null,
      hasAccessToken: fallback?.hasAccessToken ?? null,
      userId: user?.id ?? null
    })
  }

  if (!user) {
    return {
      status: "no_user",
      authenticated: false,
      user: null,
      profile: null,
      isParentUser: false,
      isStudioUser: false,
      userError: userError?.message ?? sessionError?.message ?? null
    }
  }

  const profileResult = await getProfileForUser(user)
  if (profileResult.status === "error") {
    return {
      status: "profile_error",
      authenticated: true,
      user,
      profile: null,
      isParentUser: false,
      isStudioUser: false,
      profileError: profileResult.errorMessage,
      profileErrorCode: profileResult.errorCode
    }
  }

  if (profileResult.status === "missing") {
    return {
      status: "profile_missing",
      authenticated: true,
      user,
      profile: null,
      isParentUser: false,
      isStudioUser: false
    }
  }

  if (profileResult.status === "unsupported_role") {
    return {
      status: "unsupported_role",
      authenticated: true,
      user,
      profile: null,
      isParentUser: false,
      isStudioUser: false,
      profileRole: profileResult.profileRole
    }
  }

  const { profile } = profileResult
  return {
    status: "ok",
    authenticated: true,
    user,
    profile,
    isParentUser: profile.role === "parent",
    isStudioUser: isStudioProfile(profile)
  }
})

export const resolveCurrentAuth = async (context = "unknown"): Promise<CurrentAuthState> =>
  resolveCurrentAuthCached(context)
