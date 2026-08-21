"use server"

import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { normalizeProfileRole } from "@/features/auth/lib/profile-sync"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type TeacherStudioAccess = {
  id: string
  teacherId: string
  name: string
  organizationId: string
}

const STUDIO_ROLES = ["teacher", "academy", "admin"] as const
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
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()
  const userIdPrefix = user?.id.slice(0, 8) ?? null
  debugStudioAuth({
    pathname: requestPath,
    hasUser: Boolean(user),
    userIdPrefix,
    profileLookup: null,
    errorCode: userError?.code ?? null,
    rawRole: null,
    dbRole: null,
    hasOrganizationId: null,
    hasNextRouterPrefetchHeader,
    hasPurposePrefetchHeader,
    redirectReason: user ? null : "missing_user"
  })

  if (!user) {
    redirect("/studio/sign-in")
  }

  const profileLookup = await readStudioProfile(user.id)
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
    const pendingRequest = await getPendingOrRejectedTeacherSignupRequest(user.id)
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

  const { data: teacherRow, error: teacherError } =
    normalized.dbRole === "teacher" || normalized.dbRole === "academy"
      ? await supabase
          .from("teachers")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle()
      : await supabase
          .from("teachers")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()

  if (teacherError || !teacherRow) {
    if (normalized.dbRole === "admin" || normalized.dbRole === "operator") {
      const { data: fallbackTeacherRow, error: fallbackTeacherError } = await supabase
        .from("teachers")
        .select("id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (fallbackTeacherError || !fallbackTeacherRow) {
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
          redirectReason: "no_teachers"
        })
        redirect("/studio/access?reason=no_teachers")
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
        id: user.id,
        teacherId: fallbackTeacherRow.id,
        name: data.name,
        organizationId
      }
    }

    debugStudioAuth({
      pathname: requestPath,
      hasUser: true,
      userIdPrefix,
      profileLookup: "success",
      errorCode: teacherError?.code ?? null,
      rawRole: typeof data.role === "string" ? data.role : "non_string",
      dbRole: normalized.dbRole,
      hasOrganizationId: true,
      hasNextRouterPrefetchHeader,
      hasPurposePrefetchHeader,
      redirectReason: "missing_teacher_mapping"
    })
    redirect("/studio/access?reason=missing_teacher_mapping")
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
    id: user.id,
    teacherId: teacherRow.id,
    name: data.name,
    organizationId
  }
})

export const requireTeacherStudioAccess = async (): Promise<TeacherStudioAccess> =>
  requireTeacherStudioAccessCached()
