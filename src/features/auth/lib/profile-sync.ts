import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type DbProfileRole = "parent" | "teacher" | "operator" | "academy" | "admin"

export type ProfileRole = "parent" | "academy" | "admin"

export type AuthProfile = {
  id: string
  role: ProfileRole
  dbRole: DbProfileRole
  name: string
  phone: string | null
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

export const getMyProfile = async (): Promise<AuthProfile | null> => {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

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
    name: data.name,
    phone: data.phone ?? null,
    organizationId: data.organization_id
  }
}

type EnsureParentProfileOptions = {
  allowCreateParentIfMissing: boolean
  preferredName?: string
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
    return existing
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
  const insertName = (options.preferredName ?? nameFromMetadata ?? "").trim()

  const { error } = await supabase.from("profiles").insert({
    id: user.id,
    role: "parent",
    name: insertName || getFallbackName(user.email),
    organization_id: null
  })

  if (error) {
    // If another request created the profile first, try fetching it again.
    return getMyProfile()
  }

  return getMyProfile()
}
