import { cache } from "react"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type DbProfileRole = "parent" | "teacher" | "operator" | "academy" | "admin"

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

export const normalizeProfileRole = (
  role: unknown
): { role: ProfileRole; dbRole: DbProfileRole } | null => {
  if (role === "parent") {
    return { role: "parent", dbRole: "parent" }
  }

  if (role === "teacher" || role === "academy") {
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

const getMyProfileCached = cache(async (): Promise<AuthProfile | null> => {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // Keep the base profile query aligned with the debug route so auth/role checks
  // do not fail when newer optional columns are not yet available in the DB.
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, name, phone, organization_id")
    .eq("id", user.id)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const normalizedRole = normalizeProfileRole(data.role)
  if (!normalizedRole) {
    return null
  }

  return {
    id: data.id,
    role: normalizedRole.role,
    dbRole: normalizedRole.dbRole,
    name: typeof data.name === "string" && data.name.trim().length > 0 ? data.name.trim() : getFallbackName(user.email),
    phone: data.phone ?? null,
    parentBirthDate: null,
    organizationId: data.organization_id
  }
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

  const metadataRole = user.user_metadata?.role
  const signupIntent = user.user_metadata?.signup_intent
  const isTeacherAccount =
    metadataRole === "teacher" ||
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
