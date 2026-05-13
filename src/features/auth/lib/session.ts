import { redirect } from "next/navigation"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

const SESSION_FETCH_TIMEOUT_MS = 1500

export const getSession = async () => {
  try {
    const supabase = await getSupabaseServerClient()
    const sessionResult = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SESSION_FETCH_TIMEOUT_MS)
      })
    ])

    if (!sessionResult) {
      return null
    }

    const {
      data: { session },
      error
    } = sessionResult

    if (error) {
      return null
    }

    return session
  } catch {
    return null
  }
}

export const requireSession = async (redirectTo: string) => {
  const session = await getSession()
  if (!session) {
    redirect(redirectTo)
  }
  return session
}
