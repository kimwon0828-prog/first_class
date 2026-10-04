
import { applePhoneGateHref } from "../phone/gate"
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
  const supabase = await getSupabaseServerClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub || claims.sub !== session.user.id) redirect(redirectTo)
  const params = new URL(redirectTo, "http://localhost").searchParams
  const next = params.get("returnTo") ?? params.get("next") ?? "/my"
  const phoneGate = await applePhoneGateHref({ id: claims.sub, app_metadata: claims.app_metadata as Record<string, unknown> }, next)
  if (phoneGate) redirect(phoneGate)
  return session
}
