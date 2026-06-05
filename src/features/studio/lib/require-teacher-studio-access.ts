"use server"

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

export const requireTeacherStudioAccess = async (): Promise<TeacherStudioAccess> => {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  void userError

  if (!user) {
    redirect("/studio/sign-in")
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, name, phone, organization_id")
    .eq("id", user.id)
    .maybeSingle()

  if (error || !data) {
    const { dataAdapter } = await import("@/shared/lib/db")
    const pendingRequest = await dataAdapter.getPendingTeacherSignupRequest(user.id)
    if (pendingRequest) {
      redirect("/studio/pending")
    }

    redirect("/studio/access?reason=missing_profile")
  }

  const normalized = normalizeProfileRole(data.role)
  if (!normalized) {
    redirect("/studio/access?reason=invalid_role")
  }

  const organizationId = data.organization_id ?? null
  const allowed = (STUDIO_ROLES as readonly string[]).includes(normalized.dbRole) || normalized.dbRole === "operator"

  if (!allowed) {
    redirect("/classes")
  }

  if (!organizationId) {
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
        redirect("/studio/access?reason=no_teachers")
      }

      return {
        id: user.id,
        teacherId: fallbackTeacherRow.id,
        name: data.name,
        organizationId
      }
    }

    redirect("/studio/access?reason=missing_teacher_mapping")
  }

  return {
    id: user.id,
    teacherId: teacherRow.id,
    name: data.name,
    organizationId
  }
}
