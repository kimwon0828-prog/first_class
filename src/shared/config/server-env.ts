import "server-only"

import { checkTossKeyPair, type TossKeyEnvironment } from "@/features/billing/lib/toss/keys"
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

export type TossBillingEnv = {
  /** 브라우저 SDK 에 넘길 수 있는 값. 서버에서 읽어 prop 으로 전달한다. */
  clientKey: string
  /** 서버 전용. 응답·로그·client bundle 어디에도 나가면 안 된다. */
  secretKey: string
  environment: TossKeyEnvironment
}

export type TossBillingEnvResult =
  | { status: "ready"; env: TossBillingEnv }
  /** 키가 아직 없다. 결제 진입을 막되 나머지 Studio 기능은 그대로 둔다. */
  | { status: "missing" }
  /** 키가 있는데 규칙에 어긋난다. 조용히 진행하지 않고 실패시킨다. */
  | { status: "invalid"; code: string; message: string }

/**
 * Toss 자동결제 키.
 *
 * 자동결제는 결제위젯 키가 아니라 API 개별 연동 키(ck/sk)를 쓴다.
 * TOSS_PAYMENTS_ALLOW_LIVE 를 명시적으로 켜지 않는 한 live 키는 거부한다 —
 * test 로 검증하던 코드가 키만 바뀌어 실제 청구를 일으키는 사고를 막는다.
 *
 * client key 는 NEXT_PUBLIC_ 으로 두지 않는다. 서버에서 읽어 필요한 화면에만 넘긴다.
 */
export const getTossBillingEnv = (): TossBillingEnvResult => {
  const clientKey = process.env.TOSS_PAYMENTS_CLIENT_KEY?.trim() ?? ""
  const secretKey = process.env.TOSS_PAYMENTS_SECRET_KEY?.trim() ?? ""

  if (!clientKey && !secretKey) {
    return { status: "missing" }
  }

  const allowLive = process.env.TOSS_PAYMENTS_ALLOW_LIVE?.trim() === "1"
  const checked = checkTossKeyPair(clientKey, secretKey, { allowLive })
  if (!checked.ok) {
    return { status: "invalid", code: checked.code, message: checked.message }
  }

  return {
    status: "ready",
    env: { clientKey, secretKey, environment: checked.environment }
  }
}
