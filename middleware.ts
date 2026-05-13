import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { getSupabaseMiddlewareClient } from "@/integrations/supabase/middleware"

const parentProtectedPrefixes = ["/my"]
const authRequiredExactPaths = ["/applications/complete"]
const applyPathPattern = /^\/classes\/[^/]+\/apply$/
const studioPrefix = "/studio"
const studioPublicPath = "/studio/sign-in"

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const { supabase, response } = getSupabaseMiddlewareClient(request)
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null
  try {
    const result = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200))
    ])
    session = result?.data.session ?? null
  } catch {
    session = null
  }

  const requiresParentSession =
    authRequiredExactPaths.includes(pathname) ||
    parentProtectedPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
    applyPathPattern.test(pathname)

  if (requiresParentSession && !session) {
    const url = request.nextUrl.clone()
    const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
    url.pathname = "/auth/sign-in"
    url.search = ""
    url.searchParams.set("returnTo", returnTo)
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith(studioPrefix) && pathname !== studioPublicPath && !session) {
    const url = request.nextUrl.clone()
    url.pathname = studioPublicPath
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"]
}
