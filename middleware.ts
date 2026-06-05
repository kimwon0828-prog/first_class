import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import { getSupabaseMiddlewareClient } from "@/integrations/supabase/middleware"

const parentProtectedPrefixes = ["/my"]
const authRequiredExactPaths = ["/applications/complete"]
const applyPathPattern = /^\/classes\/[^/]+\/apply$/
const studioPrefix = "/studio"
const studioPublicPaths = ["/studio/sign-in", "/studio/sign-up"]
const studioRoleSet = new Set(["teacher", "academy", "admin", "operator"])

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const { supabase, response } = getSupabaseMiddlewareClient(request)
  let session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] = null
  let profileRole: "parent" | "teacher" | "academy" | "admin" | "operator" | null = null
  try {
    const result = await supabase.auth.getSession()
    session = result.data.session ?? null

    if (
      session &&
      (pathname.startsWith(studioPrefix) ||
        parentProtectedPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
        pathname.startsWith("/applications") ||
        applyPathPattern.test(pathname))
    ) {
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle()

      profileRole =
        data?.role === "parent" ||
        data?.role === "teacher" ||
        data?.role === "academy" ||
        data?.role === "admin" ||
        data?.role === "operator"
          ? data.role
          : null
    }
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

  const isStudioPublicPath = studioPublicPaths.includes(pathname)

  if (
    !pathname.startsWith(studioPrefix) &&
    session &&
    (pathname.startsWith("/my") || pathname.startsWith("/applications")) &&
    (profileRole === "teacher" || profileRole === "academy" || profileRole === "admin" || profileRole === "operator")
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/studio"
    url.search = ""
    return NextResponse.redirect(url)
  }

  if (pathname.startsWith(studioPrefix)) {
    if (!session && !isStudioPublicPath) {
      const url = request.nextUrl.clone()
      const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
      url.pathname = studioPublicPaths[0]
      url.search = ""
      url.searchParams.set("returnTo", returnTo)
      return NextResponse.redirect(url)
    }

    // Pending teacher check: they don't have a profile role yet.
    if (isStudioPublicPath && session && !profileRole) {
      const { data } = await supabase.from("teacher_signup_requests")
        .select("status")
        .eq("user_id", session.user.id)
        .eq("status", "pending")
        .maybeSingle()

      if (data) {
        const url = request.nextUrl.clone()
        url.pathname = "/studio/pending"
        url.search = ""
        return NextResponse.redirect(url)
      }
    }

    if (!isStudioPublicPath && pathname !== "/studio/pending" && session && !profileRole) {
       const { data } = await supabase.from("teacher_signup_requests")
        .select("status")
        .eq("user_id", session.user.id)
        .eq("status", "pending")
        .maybeSingle()

      if (data) {
        const url = request.nextUrl.clone()
        url.pathname = "/studio/pending"
        url.search = ""
        return NextResponse.redirect(url)
      }
    }

    if (isStudioPublicPath && profileRole === "parent") {
      const url = request.nextUrl.clone()
      url.pathname = "/classes"
      url.search = ""
      return NextResponse.redirect(url)
    }

    if (
      !isStudioPublicPath &&
      pathname !== "/studio/pending" &&
      session &&
      profileRole &&
      !studioRoleSet.has(profileRole)
    ) {
      const url = request.nextUrl.clone()
      url.pathname = "/classes"
      url.search = ""
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: ["/my/:path*", "/applications/:path*", "/studio/:path*", "/classes/:id/apply"]
}
