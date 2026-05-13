import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { getPublicEnv } from "@/shared/config/env"

type MiddlewareSupabaseResult = {
  supabase: SupabaseClient
  response: NextResponse
}

export const getSupabaseMiddlewareClient = (
  request: NextRequest
): MiddlewareSupabaseResult => {
  const response = NextResponse.next({
    request
  })
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(
        cookiesToSet: Array<{
          name: string
          value: string
          options?: Parameters<typeof response.cookies.set>[2]
        }>
      ) {
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options)
        }
      }
    }
  })

  return { supabase, response }
}
