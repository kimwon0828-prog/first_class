
import { getApplePhoneState, enrollNewAppleParentPhone, needsPhoneVerification } from "@/features/auth/phone/gate"
import { completePhoneHref } from "@/features/auth/phone/contracts"
import { appleProfileCompletionHref, hasAppleIdentity, safeAuthReturnTo } from "@/features/auth/lib/apple-auth"
import { isMyParentAccountDeletionPending } from "@/features/my/lib/parent-account-deletion-server"
import { NextResponse } from "next/server"

import { detectOAuthEmailConflict } from "@/features/auth/lib/oauth-account-conflict"
import { ensureParentProfile, getProfileForUser } from "@/features/auth/lib/profile-sync"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

/*
 * 돌아갈 자리.
 *
 * ⚠️ 외부 주소 차단 규칙은 그대로다 — "/" 로 시작하지 않거나 "//" 로 시작하면
 *    남의 사이트로 튕길 수 있으므로 버린다. 바뀐 것은 버렸을 때의 기본값뿐이다.
 */
const resolveSafeNext = safeAuthReturnTo

const normalizePhone = (value: unknown) => {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null
}

const normalizeName = (user: {
  email?: string | null
  app_metadata?: Record<string, unknown>
  user_metadata?: Record<string, unknown>
  identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> | null }> | null
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

  if (hasAppleIdentity(user)) return undefined

  const emailLocalPart = user.email?.split("@")[0]?.trim()
  return emailLocalPart?.slice(0, 30) || "학부모"
}

const isStudioMetadataAccount = (user: { user_metadata?: Record<string, unknown> }) => {
  const signupIntent = user.user_metadata?.signup_intent

  return (
    signupIntent === "teacher_invite" ||
    signupIntent === "staff_invite" ||
    signupIntent === "teacher_public"
  )
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get("code")
  const next = resolveSafeNext(requestUrl.searchParams.get("next") ?? requestUrl.searchParams.get("returnTo"))

  if (!code || requestUrl.searchParams.has("error")) {
    return NextResponse.redirect(new URL(`/auth/sign-in?error=oauth&returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  const supabase = await getSupabaseServerClient()
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code).catch(() => ({ error: true }))

  if (exchangeError) {
    return NextResponse.redirect(new URL(`/auth/sign-in?error=oauth&returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  const {
    data: { user }
  } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))

  if (!user) {
    return NextResponse.redirect(new URL(`/auth/sign-in?error=oauth&returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
  }

  const emailConflictResult = await detectOAuthEmailConflict(user.id, user.email)
  if (!emailConflictResult.ok) {
    await supabase.auth.signOut()
    return NextResponse.redirect(
      new URL(`/auth/account-conflict?reason=${encodeURIComponent(emailConflictResult.reason)}`, requestUrl.origin)
    )
  }

  if (await isMyParentAccountDeletionPending()) return NextResponse.redirect(new URL("/my", requestUrl.origin))

  const apple = hasAppleIdentity(user)
  if (apple) {
    const existing = await getProfileForUser(user)
    if (existing.status === "error" || existing.status === "unsupported_role") {
      return NextResponse.redirect(new URL(`/auth/sign-in?error=oauth&returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
    }
    if (existing.status === "ok" && existing.profile.role !== "parent") return NextResponse.redirect(new URL(resolvePostAuthRedirect(existing.profile.role), requestUrl.origin))
    if (!isStudioMetadataAccount(user) && (existing.status === "missing" || (existing.status === "ok" && existing.profile.role === "parent"))) {
      const phone = existing.status === "missing" ? await enrollNewAppleParentPhone(user) : await getApplePhoneState(user)
      if (existing.status === "missing" && (phone.unavailable || phone.excluded)) return NextResponse.redirect(new URL(`/auth/sign-in?error=oauth&returnTo=${encodeURIComponent(next)}`, requestUrl.origin))
      if (needsPhoneVerification(phone)) return NextResponse.redirect(new URL(completePhoneHref(next), requestUrl.origin))
    }
    if (existing.status === "missing" && !isStudioMetadataAccount(user) && !normalizeName(user)) {
      return NextResponse.redirect(new URL(appleProfileCompletionHref(next), requestUrl.origin))
    }
  }

  const preferredName = normalizeName(user)
  const preferredPhone =
    normalizePhone(user.user_metadata?.phone) ??
    normalizePhone(user.identities?.[0]?.identity_data?.phone_number) ??
    normalizePhone(user.identities?.[0]?.identity_data?.phone)

  const profile = await ensureParentProfile({
    allowCreateParentIfMissing: true,
    requireProvidedName: apple,
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
