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

export type PartnerInquiryMailEnv = {
  host: string
  port: number
  user: string
  password: string
  to: string
}

const trimOptionalEnv = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export const getPartnerInquiryMailEnv = (): PartnerInquiryMailEnv | null => {
  const host = trimOptionalEnv(process.env.ZOHO_SMTP_HOST)
  const portRaw = trimOptionalEnv(process.env.ZOHO_SMTP_PORT)
  const user = trimOptionalEnv(process.env.ZOHO_SMTP_USER)
  const password = trimOptionalEnv(process.env.ZOHO_SMTP_PASSWORD)
  const to = trimOptionalEnv(process.env.PARTNER_INQUIRY_TO)

  if (!host || !portRaw || !user || !password || !to) {
    return null
  }

  const port = Number(portRaw)
  if (!Number.isInteger(port) || port <= 0) {
    return null
  }

  return {
    host,
    port,
    user,
    password,
    to
  }
}
