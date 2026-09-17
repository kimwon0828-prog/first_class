import { NextResponse } from "next/server"

import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { resolveStudioNavigationPath } from "@/shared/lib/studio-navigation-server"

export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient()
  await supabase.auth.signOut()

  /* 같은 origin 안에서 움직인다. host 에 맞는 경로만 고른다. */
  const redirectUrl = new URL(await resolveStudioNavigationPath("/studio/sign-in"), request.url)
  return NextResponse.redirect(redirectUrl)
}

