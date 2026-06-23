import "server-only"

import { getPublicEnv } from "@/shared/config/env"

type ServerEnv = {
  supabaseUrl: string
  supabaseServiceRoleKey: string
}

export const getServerEnv = (): ServerEnv => {
  const { supabaseUrl } = getPublicEnv()
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-only Supabase access")
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey
  }
}
