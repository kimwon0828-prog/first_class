import { cache } from "react"
import { redirect } from "next/navigation"

import { getVerifiedClaims } from "@/features/auth/lib/verified-claims"
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

/**
 * 로그인 여부만 필요한 화면용. session 객체가 아니라 검증된 user id 만 돌려준다.
 *
 * getSession() 과 달리 만료된 토큰을 refresh 하지 않는다. Studio auth 진입 페이지
 * (sign-in · sign-up · pending)는 middleware 와 같은 navigation 에 있어서, 양쪽이 각자
 * refresh 하면 같은 refresh token 으로 동시 갱신이 일어나 409 가 난다.
 * 만료됐으면 null 이 되고 화면은 로그인 폼을 그대로 보여 준다(fail closed).
 */
export const getVerifiedUserId = async (): Promise<string | null> => {
  const claims = await getVerifiedClaims()
  return claims?.userId ?? null
}

export const requireSession = async (redirectTo: string) => {
  const session = await getSession()
  if (!session) {
    redirect(redirectTo)
  }
  return session
}
