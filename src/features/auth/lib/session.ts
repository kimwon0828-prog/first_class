import { cache } from "react"
import { redirect } from "next/navigation"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

const getSessionCached = cache(async () => {
  try {
    const supabase = await getSupabaseServerClient()
    const {
      data: { session },
      error
    } = await supabase.auth.getSession()

    if (error) {
      return null
    }

    return session
  } catch {
    return null
  }
})

export const getSession = async () => getSessionCached()

export const requireSession = async (redirectTo: string) => {
  const session = await getSession()
  if (!session) {
    redirect(redirectTo)
  }
  return session
}
