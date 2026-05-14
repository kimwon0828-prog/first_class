"use server"

import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSession } from "@/features/auth/lib/session"

export type TeacherStudioAccess = {
  id: string
  name: string
  organizationId: string
}

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

  if (profile.role !== "teacher") {
    redirect("/classes")
  }

  if (!profile.organizationId) {
    redirect("/studio/sign-in")
  }

  return {
    id: profile.id,
    name: profile.name,
    organizationId: profile.organizationId
  }
}
