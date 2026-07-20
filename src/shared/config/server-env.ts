import "server-only"

import { getPublicEnv } from "@/shared/config/env"

type ServerEnv = {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  naverMapClientId: string | null
  naverMapClientSecret: string | null
}

export const getServerEnv = (): ServerEnv => {
  const { supabaseUrl } = getPublicEnv()
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-only Supabase access")
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    naverMapClientId:
      process.env.NAVER_MAPS_CLIENT_ID ??
      process.env.NAVER_MAP_CLIENT_ID ??
      process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID ??
      process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ??
      null,
    naverMapClientSecret:
      process.env.NAVER_MAPS_CLIENT_SECRET ?? process.env.NAVER_MAP_CLIENT_SECRET ?? null
  }
}
