import { createServerClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"
import { cookies, headers } from "next/headers"

import { getPublicEnv } from "@/shared/config/env"

const extractProjectRefFromSupabaseUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname
    const match = host.match(/^([a-z0-9]+)\./i)
    return match?.[1]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

const extractProjectRefFromAuthCookieName = (cookieName: string): string | null => {
  const match = cookieName.match(/^sb-([a-z0-9]+)-auth-token/i)
  return match?.[1]?.toLowerCase() ?? null
}

export const getSupabaseServerClient = async (): Promise<SupabaseClient> => {
  const cookieStore = await cookies()
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()

  if (process.env.NEXT_PUBLIC_DEBUG_AUTH === "1") {
    const refFromUrl = extractProjectRefFromSupabaseUrl(supabaseUrl)
    const requestHeaders = await headers()
    const rawCookieHeader = requestHeaders.get("cookie") ?? ""
    const cookieRefs = Array.from(
      new Set(
        cookieStore
          .getAll()
          .map((cookie) => extractProjectRefFromAuthCookieName(cookie.name))
          .filter((value): value is string => Boolean(value))
      )
    )

    console.log("[server supabase env]", {
      refFromUrl,
      cookieRefs,
      hasSbCookieInHeader: rawCookieHeader.includes("sb-"),
      cookieHeaderLength: rawCookieHeader.length
    })
  }

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(
        cookiesToSet: Array<{
          name: string
          value: string
          options?: Parameters<typeof cookieStore.set>[2]
        }>
      ) {
        // Server Components may not allow mutating cookies in every render path.
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          }
        } catch {
          // Cookie sync is handled by middleware/action paths when mutation is allowed.
        }
      }
    }
  })
}
