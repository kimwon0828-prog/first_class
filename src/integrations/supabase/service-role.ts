import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { getServerEnv } from "@/shared/config/server-env"

let serviceRoleClient: SupabaseClient | null = null

export const getSupabaseServiceRoleClient = (): SupabaseClient => {
  if (serviceRoleClient) {
    return serviceRoleClient
  }

  const { supabaseUrl, supabaseServiceRoleKey } = getServerEnv()
  serviceRoleClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })

  return serviceRoleClient
}
