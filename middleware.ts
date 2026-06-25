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
    await supabase.auth.getUser()
  } catch {}

  return response
}

export const config = {
  matcher: ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"]
}
