"use server"

import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"

export const requireAdmin = async (returnTo: string) => {
  await requireSession(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  const profile = await getMyProfile()

  if (!profile) {
    redirect("/classes")
  }

  if (profile.dbRole !== "admin") {
    redirect(profile.role === "parent" ? "/classes" : "/studio")
  }

  return profile
}
