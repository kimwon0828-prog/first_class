import { NextResponse } from "next/server"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient()
  await supabase.auth.signOut()

  const redirectUrl = new URL("/auth/sign-in", request.url)
  return NextResponse.redirect(redirectUrl)
}
