import { NextResponse } from "next/server"

import { detectOAuthEmailConflict } from "@/features/auth/lib/oauth-account-conflict"
import { ensureParentProfile } from "@/features/auth/lib/profile-sync"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

const resolveSafeNext = (value: string | null) => {
  const normalized = value?.trim() ?? ""
  if (!normalized) {
    return "/classes"
  }

  if (!normalized.startsWith("/") || normalized.startsWith("//")) {
    return "/classes"
  }

  return normalized
}

const normalizePhone = (value: unknown) => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

const normalizeName = (user: {
  email?: string | null
  user_metadata?: Record<string, unknown>
  identities?: Array<{ identity_data?: Record<string, unknown> | null }> | null
}) => {
  const metadata = user.user_metadata ?? {}
  const identityData = user.identities?.[0]?.identity_data ?? {}
  const candidates = [
    metadata.name,
    metadata.full_name,
    metadata.nickname,
    identityData.name,
    identityData.nickname,
    identityData.profile_nickname
  ]

  const preferred = candidates.find((value) => typeof value === "string" && value.trim().length > 0)
  if (typeof preferred === "string") {
    return preferred.trim().slice(0, 30)
  }

  const emailLocalPart = user.email?.split("@")[0]?.trim()
  return emailLocalPart?.slice(0, 30) || "학부모"
}

const isStudioMetadataAccount = (user: { user_metadata?: Record<string, unknown> }) => {
  const metadataRole = user.user_metadata?.role
  const signupIntent = user.user_metadata?.signup_intent

  return (
    metadataRole === "teacher" ||
    signupIntent === "teacher_invite" ||
    signupIntent === "staff_invite" ||
    signupIntent === "teacher_public"
  )
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = resolveSafeNext(requestUrl.searchParams.get("next"))

  if (!code) {
    return NextResponse.redirect(new URL(`/auth/sign-in?returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  const supabase = await getSupabaseServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError) {
    return NextResponse.redirect(new URL(`/auth/sign-in?returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.redirect(new URL(`/auth/sign-in?returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  const emailConflictResult = await detectOAuthEmailConflict(user.id, user.email)
  if (!emailConflictResult.ok) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL(`/auth/account-conflict?reason=${encodeURIComponent(emailConflictResult.reason)}`, requestUrl.origin)
    )
  }

  const preferredName = normalizeName(user)
  const preferredPhone =
    normalizePhone(user.user_metadata?.phone) ??
    normalizePhone(user.identities?.[0]?.identity_data?.phone_number) ??
    normalizePhone(user.identities?.[0]?.identity_data?.phone)

  const profile = await ensureParentProfile({
    allowCreateParentIfMissing: true,
    preferredName,
    preferredPhone
  })

  if (!profile) {
    if (isStudioMetadataAccount(user)) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL("/auth/account-conflict?reason=studio_account", requestUrl.origin))
    }

    await supabase.auth.signOut()
    return NextResponse.redirect(new URL("/auth/account-conflict?reason=account_check_failed", requestUrl.origin))
  }

  const destination = profile.role === "parent" ? next : resolvePostAuthRedirect(profile.role)
  return NextResponse.redirect(new URL(destination, requestUrl.origin))
}
