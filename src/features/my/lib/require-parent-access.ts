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
    data: { user },
    error: userError
  } = await supabase.auth.getUser()

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[requireParentAccess] getUser", {
      returnTo,
      userId: user?.id ?? null,
      userError: userError?.message ?? null
    })
  }

  if (userError || !user) {
    redirect(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  }

  const profile = await getMyProfile()
  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[requireParentAccess] profile", {
      returnTo,
      userId: user.id,
      role: profile?.role ?? null
    })
  }
  if (!profile) {
    redirect("/classes")
  }

  if (profile.role !== "parent") {
    redirect("/studio")
  }

  return profile
}
