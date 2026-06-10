"use server"

import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

type RequireParentAccessOptions = {
  returnTo: string
}

export const requireParentAccess = async ({ returnTo }: RequireParentAccessOptions) => {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const profile = await getMyProfile()
  if (!profile) {
    redirect("/classes")
  }

  if (profile.role !== "parent") {
    redirect("/studio")
  }

  return profile
}

