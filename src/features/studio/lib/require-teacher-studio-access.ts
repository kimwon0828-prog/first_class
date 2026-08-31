"use server"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { normalizeProfileRole } from "@/features/auth/lib/profile-sync"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

// Studio 접근 context 는 로그인 운영 멤버(profile)와 organization 만으로 구성한다.
// 수업 담당 선생님은 classes.teacher_id(teachers.id) 가 canonical source 이며,
// 로그인 actor 와 개념이 다르므로 이 타입에 teacher 식별자를 두지 않는다.
export type TeacherStudioAccess = {
  id: string
  name: string
  organizationId: string
}

const STUDIO_ROLES = ["academy", "admin"] as const
const shouldDebugAuth = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_AUTH === "1"

type StudioProfileRow = {
  id: string
  role: unknown
  name: string
  phone: string | null
  organization_id: string | null
}

type StudioProfileLookupResult =
  | {
      kind: "success"
      data: StudioProfileRow
      errorCode: null
    }
  | {
      kind: "missing"
      errorCode: null
    }
  | {
      kind: "error"
      errorCode: string | null
    }

type SignupRequestStatusRow = {
  status: string
}

const getPendingOrRejectedTeacherSignupRequest = async (
  userId: string
): Promise<SignupRequestStatusRow | null> => {
  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from("teacher_signup_requests")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["pending", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    return null
  }

  return (data as SignupRequestStatusRow | null) ?? null
}

const debugStudioAuth = (
  payload: Record<string, string | boolean | null | undefined>
) => {
  if (!shouldDebugAuth) {
    return
  }

  console.info("[requireTeacherStudioAccess]", payload)
}

const readStudioProfile = async (
  userId: string
): Promise<StudioProfileLookupResult> => {
  const supabase = await getSupabaseServerClient()
  const runQuery = async () =>
    supabase.from("profiles").select("id, role, name, phone, organization_id").eq("id", userId).maybeSingle()

  const firstAttempt = await runQuery()
  if (!firstAttempt.error) {
    return firstAttempt.data
      ? { kind: "success", data: firstAttempt.data, errorCode: null }
      : { kind: "missing", errorCode: null }
  }

  const secondAttempt = await runQuery()
  if (!secondAttempt.error) {
    return secondAttempt.data
      ? { kind: "success", data: secondAttempt.data, errorCode: null }
      : { kind: "missing", errorCode: null }
  }

  return {
    kind: "error",
    errorCode: secondAttempt.error.code ?? firstAttempt.error.code ?? null
  }
}

const requireTeacherStudioAccessCached = cache(async (): Promise<TeacherStudioAccess> => {
  const supabase = await getSupabaseServerClient()
  const requestHeaders = await headers()
  const requestPath =
    requestHeaders.get("next-url") ??
    requestHeaders.get("x-invoke-path") ??
    requestHeaders.get("x-matched-path") ??
    "unknown"
  const hasNextRouterPrefetchHeader = Boolean(requestHeaders.get("next-router-prefetch"))
  const hasPurposePrefetchHeader = requestHeaders.get("purpose") === "prefetch"
  // 인증된 user id 확인 전용. asymmetric JWT 를 JWKS 로 로컬 검증하므로 Auth 서버 왕복이 없다.
  // 권한(role/organization)의 canonical source 는 아래의 profiles/teachers 그대로다.
  // claims 의 role/user_metadata 는 authorization 근거로 쓰지 않는다.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims()
  const userId = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null
  const userIdPrefix = userId?.slice(0, 8) ?? null
  debugStudioAuth({
    pathname: requestPath,
    hasUser: Boolean(userId),
    userIdPrefix,
    profileLookup: null,
    errorCode: claimsError?.code ?? null,
    rawRole: null,
    dbRole: null,
    hasOrganizationId: null,
    hasNextRouterPrefetchHeader,
    hasPurposePrefetchHeader,
    redirectReason: userId ? null : "missing_user"
  })

  if (!userId) {
    redirect("/studio/sign-in")
  }

  const profileLookup = await readStudioProfile(userId)
  if (profileLookup.kind === "error") {
    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "error",
      errorCode: profileLookup.errorCode,
      rawRole: null,
      dbRole: null,
      hasOrganizationId: null,
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "profile_lookup_failed"
    })
    redirect("/studio/access?reason=profile_lookup_failed")
  }

  if (profileLookup.kind === "missing") {
    const pendingRequest = await getPendingOrRejectedTeacherSignupRequest(userId)
    if (pendingRequest) {
      debugStudioAuth({
        pathname: requestPath,
        hasUser: true,
        userIdPrefix,
        profileLookup: "missing",
        errorCode: null,
        rawRole: null,
        dbRole: null,
        hasOrganizationId: null,
        hasNextRouterPrefetchHeader,
        hasPurposePrefetchHeader,
        redirectReason: "pending_or_rejected_teacher_request"
      })
      redirect("/studio/pending")
    }

    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "missing",
      errorCode: null,
      rawRole: null,
      dbRole: null,
      hasOrganizationId: null,
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "missing_profile"
    })
    redirect("/studio/access?reason=missing_profile")
  }

  const { data } = profileLookup
  const normalized = normalizeProfileRole(data.role)
  if (!normalized) {
    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "success",
      errorCode: null,
      rawRole: typeof data.role === "string" ? data.role : "non_string",
      dbRole: null,
      hasOrganizationId: Boolean(data.organization_id),
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "invalid_role"
    })
    redirect("/studio/access?reason=invalid_role")
  }

  const organizationId = data.organization_id ?? null
  const allowed = (STUDIO_ROLES as readonly string[]).includes(normalized.dbRole) || normalized.dbRole === "operator"

  if (!allowed && normalized.dbRole === "parent") {
    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "success",
      errorCode: null,
      rawRole: typeof data.role === "string" ? data.role : "non_string",
      dbRole: normalized.dbRole,
      hasOrganizationId: Boolean(organizationId),
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "parent_role_redirect_classes"
    })
    redirect("/classes")
  }

  if (!allowed) {
    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "success",
      errorCode: null,
      rawRole: typeof data.role === "string" ? data.role : "non_string",
      dbRole: normalized.dbRole,
      hasOrganizationId: Boolean(organizationId),
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "invalid_role"
    })
    redirect("/studio/access?reason=invalid_role")
  }

  if (!organizationId) {
    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "success",
      errorCode: null,
      rawRole: typeof data.role === "string" ? data.role : "non_string",
      dbRole: normalized.dbRole,
      hasOrganizationId: false,
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "missing_org"
    })
    redirect("/studio/access?reason=missing_org")
  }

  debugStudioAuth({
    pathname: requestPath,
    hasUser: true,
    userIdPrefix,
    profileLookup: "success",
    errorCode: null,
    rawRole: typeof data.role === "string" ? data.role : "non_string",
    dbRole: normalized.dbRole,
    hasOrganizationId: true,
    hasNextRouterPrefetchHeader,
    hasPurposePrefetchHeader,
    redirectReason: null
  })
  return {
    id: userId,
    name: data.name,
    organizationId
  }
})

export const requireTeacherStudioAccess = async (): Promise<TeacherStudioAccess> =>
  requireTeacherStudioAccessCached()
