import type { NextRequest } from "next/server"

import { getSupabaseMiddlewareClient } from "@/integrations/supabase/middleware"

export async function middleware(request: NextRequest) {
  const { supabase, response } = getSupabaseMiddlewareClient(request)

  try {
    await supabase.auth.getSession()
  } catch {}

  return response
}

export const config = {
  matcher: ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"]
}
