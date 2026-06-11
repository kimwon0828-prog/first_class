"use client"

import { createBrowserClient } from "@supabase/ssr"
import type { SupabaseClient } from "@supabase/supabase-js"

import { getPublicEnv } from "@/shared/config/env"

let browserClient: SupabaseClient | null = null

export const createSupabaseBrowserClient = (): SupabaseClient => {
  if (browserClient) {
    return browserClient
  }

  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
  browserClient = createBrowserClient(supabaseUrl, supabasePublishableKey)
  return browserClient
}

export const getSupabaseBrowserClient = (): SupabaseClient => createSupabaseBrowserClient()
