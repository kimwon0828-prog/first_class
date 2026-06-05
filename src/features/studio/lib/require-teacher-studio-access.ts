"use server"

import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type TeacherStudioAccess = {
  id: string
  teacherId: string
  name: string
  organizationId: string
}

const STUDIO_ROLES = ["teacher", "academy", "admin"] as const

export const requireTeacherStudioAccess = async (): Promise<TeacherStudioAccess> => {
  const session = await getSession()
  if (!session) {
    redirect("/studio/sign-in")
  }

  const profile = await getMyProfile()

  if (!profile) {
    const { dataAdapter } = await import("@/shared/lib/db")
    const pendingRequest = await dataAdapter.getPendingTeacherSignupRequest(session.user.id)
    if (pendingRequest) {
      redirect("/studio/pending")
    }

    redirect("/studio/sign-in")
  }

  const isStudioRole =
    (STUDIO_ROLES as readonly string[]).includes(profile.dbRole) || profile.dbRole === "operator"
  if (!isStudioRole) {
    redirect("/classes")
  }

  if (!profile.organizationId) {
    redirect("/studio/sign-in")
  }

  const supabase = await getSupabaseServerClient()
  const { data: teacherRow, error: teacherError } =
    profile.dbRole === "teacher" || profile.dbRole === "academy"
      ? await supabase
          .from("teachers")
          .select("id")
          .eq("profile_id", profile.id)
          .maybeSingle()
      : await supabase
          .from("teachers")
          .select("id")
          .eq("organization_id", profile.organizationId)
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()

  if (teacherError || !teacherRow) {
    if (profile.dbRole === "admin" || profile.dbRole === "operator") {
      const { data: fallbackTeacherRow, error: fallbackTeacherError } = await supabase
        .from("teachers")
        .select("id")
        .eq("organization_id", profile.organizationId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

      if (fallbackTeacherError || !fallbackTeacherRow) {
        redirect("/studio/teachers")
      }

      return {
        id: profile.id,
        teacherId: fallbackTeacherRow.id,
        name: profile.name,
        organizationId: profile.organizationId
      }
    }

    redirect("/studio/sign-in")
  }

  return {
    id: profile.id,
    teacherId: teacherRow.id,
    name: profile.name,
    organizationId: profile.organizationId
  }
}
