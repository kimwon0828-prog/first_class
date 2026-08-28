import type { NextRequest } from "next/server"

import { getSupabaseMiddlewareClient } from "@/integrations/supabase/middleware"

export async function middleware(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    console.log("[middleware]", {
      pathname: request.nextUrl.pathname,
      hasCookie: Boolean(request.headers.get("cookie"))
    })
  }

  const { supabase, response } = getSupabaseMiddlewareClient(request)

  try {
    // getUser() 와 같은 목적(JWT 검증 + 필요 시 refresh + 갱신 cookie 전파)이지만,
    // asymmetric signing key 프로젝트에서는 JWKS 로 로컬 검증하므로 Auth 서버 왕복이 없다.
    // 여기서는 authz 판단을 하지 않는다. 세션 갱신만 담당하는 기존 의미를 그대로 둔다.
    await supabase.auth.getClaims()
  } catch {}

  return response
}

export const config = {
  matcher: ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"]
}
