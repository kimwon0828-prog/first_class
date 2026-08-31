import { cache } from "react"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type DbProfileRole = "parent" | "operator" | "academy" | "admin"

export type ProfileRole = "parent" | "academy" | "admin"

export type AuthProfile = {
  id: string
  role: ProfileRole
  dbRole: DbProfileRole
  name: string
  phone: string | null
  parentBirthDate: string | null
  organizationId: string | null
}

export type AuthUserIdentity = {
  id: string
  email?: string
}

export type AuthProfileLookupResult =
  | {
      status: "ok"
      profile: AuthProfile
    }
  | {
      status: "missing"
    }
  | {
      status: "unsupported_role"
      profileRole: string | null
    }
  | {
      status: "error"
      errorCode: string | null
      errorMessage: string
    }

export const normalizeProfileRole = (
  role: unknown
): { role: ProfileRole; dbRole: DbProfileRole } | null => {
  if (role === "parent") {
    return { role: "parent", dbRole: "parent" }
  }

  if (role === "academy") {
    return { role: "academy", dbRole: role }
  }

  if (role === "operator" || role === "admin") {
    return { role: "admin", dbRole: role }
  }

  return null
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

const normalizeBirthDate = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null
  }

  const normalized = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null
}

type ProfileRow = {
  id: string
  role: unknown
  name: string
  phone: string | null
  organization_id: string | null
}

type ProfileQueryResult =
  | {
      kind: "success"
      data: ProfileRow
    }
  | {
      kind: "missing"
    }
  | {
      kind: "error"
      errorCode: string | null
      errorMessage: string
    }

const shouldDebugAuth = process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_DEBUG_AUTH === "1"

const queryOwnProfile = async (userId: string): Promise<ProfileQueryResult> => {
  const supabase = await getSupabaseServerClient()
  const runQuery = async () =>
    supabase.from("profiles").select("id, role, name, phone, organization_id").eq("id", userId).maybeSingle()

  const firstAttempt = await runQuery()

  if (!firstAttempt.error) {
    return firstAttempt.data ? { kind: "success", data: firstAttempt.data } : { kind: "missing" }
  }

  if (shouldDebugAuth) {
    console.info("[profile-sync] profile_lookup_retry", {
      userIdPrefix: userId.slice(0, 8),
      errorCode: firstAttempt.error.code ?? null
    })
  }

  const secondAttempt = await runQuery()

  if (!secondAttempt.error) {
    return secondAttempt.data ? { kind: "success", data: secondAttempt.data } : { kind: "missing" }
  }

  if (shouldDebugAuth) {
    console.info("[profile-sync] profile_lookup_failed", {
      userIdPrefix: userId.slice(0, 8),
      errorCode: secondAttempt.error.code ?? null
    })
  }

  return {
    kind: "error",
    errorCode: secondAttempt.error.code ?? firstAttempt.error.code ?? null,
    errorMessage: secondAttempt.error.message || firstAttempt.error.message
  }
}

const getProfileForUserCached = cache(
  async (userId: string, email: string | undefined): Promise<AuthProfileLookupResult> => {
    const profileQuery = await queryOwnProfile(userId)
    if (profileQuery.kind === "missing") {
      return { status: "missing" }
    }

    if (profileQuery.kind === "error") {
      return {
        status: "error",
        errorCode: profileQuery.errorCode,
        errorMessage: profileQuery.errorMessage
      }
    }

    const { data } = profileQuery
    const normalizedRole = normalizeProfileRole(data.role)
    if (!normalizedRole) {
      return {
        status: "unsupported_role",
        profileRole: data.role == null ? null : String(data.role)
      }
    }

    return {
      status: "ok",
      profile: {
        id: data.id,
        role: normalizedRole.role,
        dbRole: normalizedRole.dbRole,
        name: typeof data.name === "string" && data.name.trim().length > 0 ? data.name.trim() : getFallbackName(email),
        phone: data.phone ?? null,
        parentBirthDate: null,
        organizationId: data.organization_id
      }
    }
  }
)

export const getProfileForUser = async (user: AuthUserIdentity): Promise<AuthProfileLookupResult> =>
  getProfileForUserCached(user.id, user.email)

const getMyProfileCached = cache(async (): Promise<AuthProfile | null> => {
  const supabase = await getSupabaseServerClient()
  // 검증된 identity(sub/email) 만 얻는 용도. asymmetric JWT 를 JWKS 로 로컬 검증하므로
  // Auth 서버 왕복이 없고, 만료가 임박하면 getUser() 와 동일하게 refresh 를 먼저 수행한다.
  // role 판정은 아래 getProfileForUser 가 읽는 profiles 그대로이며 claims 의 metadata 는 쓰지 않는다.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  const userId = typeof claims?.sub === "string" ? claims.sub : null

  if (!userId) {
    return null
  }

  const profileResult = await getProfileForUser({
    id: userId,
    email: typeof claims?.email === "string" ? claims.email : undefined
  })
  return profileResult.status === "ok" ? profileResult.profile : null
})

export const getMyProfile = async (): Promise<AuthProfile | null> => getMyProfileCached()

type EnsureParentProfileOptions = {
  allowCreateParentIfMissing: boolean
  preferredName?: string
  preferredPhone?: string | null
  preferredParentBirthDate?: string | null
}

export const ensureParentProfile = async (
  options: EnsureParentProfileOptions
): Promise<AuthProfile | null> => {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const existing = await getMyProfile()
  if (existing) {
    const { data: existingDetails } = await supabase
      .from("profiles")
      .select("name, phone, parent_birth_date")
      .eq("id", existing.id)
      .maybeSingle()
    const nextName =
      typeof existingDetails?.name === "string" && existingDetails.name.trim().length > 0
        ? existingDetails.name.trim()
        : existing.name.trim()
    const nextPhone =
      typeof existingDetails?.phone === "string" && existingDetails.phone.trim().length > 0
        ? existingDetails.phone.trim()
        : existing.phone
    const nextParentBirthDate = normalizeBirthDate(existingDetails?.parent_birth_date)
    const preferredPhone =
      typeof options.preferredPhone === "string" && options.preferredPhone.trim().length > 0
        ? options.preferredPhone.trim()
        : typeof user.user_metadata?.phone === "string" && user.user_metadata.phone.trim().length > 0
          ? user.user_metadata.phone.trim()
          : null
    const preferredParentBirthDate =
      normalizeBirthDate(options.preferredParentBirthDate) ??
      normalizeBirthDate(user.user_metadata?.parent_birth_date)

    const profileUpdates: {
      phone?: string
      name?: string
      parent_birth_date?: string
      updated_at?: string
    } = {}

    if (!nextPhone && preferredPhone) {
      profileUpdates.phone = preferredPhone
    }

    if (!nextName) {
      profileUpdates.name = getFallbackName(user.email)
    }

    if (!nextParentBirthDate && preferredParentBirthDate) {
      profileUpdates.parent_birth_date = preferredParentBirthDate
    }

    if (Object.keys(profileUpdates).length > 0) {
      await supabase
        .from("profiles")
        .update({
          ...profileUpdates,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
    }

    if (Object.keys(profileUpdates).length > 0) {
      return {
        ...existing,
        phone: profileUpdates.phone ?? existing.phone,
        name: profileUpdates.name ?? existing.name,
        parentBirthDate: profileUpdates.parent_birth_date ?? nextParentBirthDate
      }
    }

    return {
      ...existing,
      parentBirthDate: nextParentBirthDate
    }
  }

  if (!options.allowCreateParentIfMissing) {
    return null
  }

  // 학원(Studio) 계정 판별은 signup_intent 하나로만 한다. legacy metadata role="teacher" 는
  // signup_intent 와 항상 함께 기록되던 중복 신호였고, writer 에서 제거되었다.
  const signupIntent = user.user_metadata?.signup_intent
  const isTeacherAccount =
    signupIntent === "teacher_invite" ||
    signupIntent === "staff_invite" ||
    signupIntent === "teacher_public"
  if (isTeacherAccount) {
    return null
  }

  const nameFromMetadata =
    typeof user.user_metadata?.name === "string" ? user.user_metadata.name : undefined
  const phoneFromMetadata =
    typeof user.user_metadata?.phone === "string" ? user.user_metadata.phone : undefined
  const parentBirthDateFromMetadata = normalizeBirthDate(user.user_metadata?.parent_birth_date)
  const insertName = (options.preferredName ?? nameFromMetadata ?? "").trim()
  const insertPhone = (options.preferredPhone ?? phoneFromMetadata ?? "").trim()
  const insertParentBirthDate =
    normalizeBirthDate(options.preferredParentBirthDate) ?? parentBirthDateFromMetadata

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    role: "parent",
    name: insertName || getFallbackName(user.email),
    phone: insertPhone || null,
    parent_birth_date: insertParentBirthDate,
    organization_id: null
  })

  if (error) {
    // If another request created the profile first, try fetching it again.
    return getMyProfile()
  }

  return getMyProfile()
}
