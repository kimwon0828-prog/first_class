import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { NextRequest, NextResponse } from "next/server"

import { getPublicEnv } from "@/shared/config/env"

type ResponseCookieOptions = Parameters<NextResponse["cookies"]["set"]>[2]

type PendingCookie = {
  name: string
  value: string
  options?: ResponseCookieOptions
}

type MiddlewareSupabaseResult = {
  supabase: SupabaseClient
  /**
   * Cookies Supabase asked us to write, drained once.
   *
   * The caller applies them to the response it builds. Draining keeps a second
   * call from writing the same Set-Cookie twice.
   */
  takePendingCookies: () => PendingCookie[]
}

/**
 * Supabase client for middleware.
 *
 * ⚠️ 이 helper 는 response 를 만들지 않는다. 그게 이 파일의 핵심이다.
 *
 *    예전 구조는 setAll 안에서 NextResponse.next() 를 다시 만들어 거기에
 *    cookie 를 썼다. 그런데 helper 는 getClaims() 가 돌기 전에 이미 return
 *    했으므로, 호출자가 들고 있는 response 는 처음 만든 쪽이었다. 즉 갱신된
 *    토큰의 Set-Cookie 가 매번 버려지는 response 에만 적혔다.
 *
 *    그래서 setAll 은 이제 두 가지만 한다 — request cookie 를 갱신하고,
 *    쓸 cookie 를 모아 둔다. 최종 response 는 호출자가 refresh 가 끝난 뒤
 *    딱 한 번 만들고(그래서 갱신된 cookie 가 downstream 으로 그대로 넘어간다)
 *    모아 둔 cookie 를 거기에 적는다. rewrite response 든 next response 든
 *    한 번 만들어진 뒤로 교체되지 않는다.
 *
 *    cookie 계약은 건드리지 않는다 — 이름 · domain · sameSite · secure · path
 *    전부 Supabase 가 준 options 를 그대로 넘긴다.
 */
export const getSupabaseMiddlewareClient = (request: NextRequest): MiddlewareSupabaseResult => {
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
  const pendingCookies: PendingCookie[] = []

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: PendingCookie[]) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value)
          pendingCookies.push(cookie)
        }
      }
    }
  })

  return {
    supabase,
    takePendingCookies: () => pendingCookies.splice(0, pendingCookies.length)
  }
}
