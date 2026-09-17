"use server"

import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { resolveStudioCrossProductHref } from "@/shared/lib/cross-product-navigation-server"

export const requireAdmin = async (returnTo: string) => {
  await requireSession(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  const profile = await getMyProfile()

  if (!profile) {
    redirect("/classes")
  }

  if (profile.dbRole !== "admin") {
    /* Studio 계정은 다른 origin 으로 내보낸다. 학부모는 Parent 안에 남는다. */
    redirect(profile.role === "parent" ? "/classes" : await resolveStudioCrossProductHref("/studio"))
  }

  return profile
}
