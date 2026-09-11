import "server-only"

import { cache } from "react"

import { getRequestAccessToken, getSupabaseServerClient } from "@/integrations/supabase/server"

/**
 * 요청 1건의 검증된 identity.
 *
 * ⚠️ 이 경로는 절대 session 을 refresh 하지 않는다.
 *
 * supabase-js 의 getSession()/getClaims() 는 access token 이 만료됐으면
 * autoRefreshToken 설정과 무관하게 _callRefreshToken 을 호출한다
 * (GoTrueClient __loadSession). middleware · layout · page · server action 이
 * 각자 독립 client 로 같은 요청을 처리하므로, 만료된 세션에서는 같은 refresh token 으로
 * 동시 갱신이 일어나 GoTrue 가 409 "Too many concurrent token refresh requests" 를
 * 돌려준다. supabase-js 는 이를 retryable 로 보고 재시도하며, staging 처럼 Auth 가 느린
 * 환경에서는 재시도가 쌓여 Vercel 의 25초 초기 응답 한도를 넘긴다.
 *
 * 그래서 여기서는 access token 을 cookie 에서 직접 꺼내 getClaims(token) 으로 넘긴다.
 * jwt 인자를 주면 getSession() 경로를 건너뛰므로 refresh 가 일어나지 않는다.
 *
 * 검증은 약해지지 않는다. jwt 를 명시하면 auth-js 가 exp 를 validateExp 로 거절하고
 * (allowExpired 를 쓰지 않는다), ES256 서명을 JWKS 공개키로 crypto.subtle.verify 한다.
 * 만료된 토큰은 여기서 null 이 되고 호출자는 기존과 같이 sign-in 으로 돌아간다(fail closed).
 *
 * refresh 의 주인은 middleware 하나다. cookie 를 실제로 쓸 수 있는 유일한 자리이기 때문이다
 * (Server Component 의 cookies().set 은 throw 되어 갱신 결과가 버려진다).
 */
export type VerifiedClaims = {
  userId: string
  email: string | undefined
}

const getVerifiedClaimsCached = cache(async (): Promise<VerifiedClaims | null> => {
  const accessToken = await getRequestAccessToken()
  if (!accessToken) {
    return null
  }

  try {
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase.auth.getClaims(accessToken)
    if (error || !data?.claims) {
      return null
    }

    const subject = typeof data.claims.sub === "string" ? data.claims.sub : null
    if (!subject) {
      return null
    }

    return {
      userId: subject,
      email: typeof data.claims.email === "string" ? data.claims.email : undefined
    }
  } catch {
    return null
  }
})

export const getVerifiedClaims = async () => getVerifiedClaimsCached()
