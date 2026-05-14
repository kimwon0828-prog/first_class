import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type ProfileRole = "parent" | "teacher"

export type AuthProfile = {
  id: string
  role: ProfileRole
  name: string
  organizationId: string | null
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
    .select("id, role, name, organization_id")
    .eq("id", user.id)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  if (data.role !== "parent" && data.role !== "teacher") {
    return null
  }

  return {
    id: data.id,
    role: data.role,
    name: data.name,
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
