import { NextResponse } from "next/server"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

const logSignOutRequest = (request: Request, method: "GET" | "POST") => {
  const url = new URL(request.url)
  console.log("[sign-out called]", {
    method,
    pathname: url.pathname,
    referer: request.headers.get("referer"),
    userAgent: request.headers.get("user-agent"),
    fetchDest: request.headers.get("sec-fetch-dest"),
    fetchMode: request.headers.get("sec-fetch-mode"),
    fetchSite: request.headers.get("sec-fetch-site")
  })
}

export async function GET(request: Request) {
  logSignOutRequest(request, "GET")
  const redirectUrl = new URL("/my", request.url)
  return NextResponse.redirect(redirectUrl)
}

export async function POST(request: Request) {
  logSignOutRequest(request, "POST")

  const supabase = await getSupabaseServerClient()
  await supabase.auth.signOut()

  const redirectUrl = new URL("/auth/sign-in", request.url)
  return NextResponse.redirect(redirectUrl, 303)
}
