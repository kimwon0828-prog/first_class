import { createClient } from "@supabase/supabase-js"
import { after } from "next/server"

import { sendMarketingConsentNoticeSafely } from "@/features/marketing-consent/server/consent-notice-sender"
import { createNativeMarketingConsentHandler } from "@/features/marketing-consent/server/native-handler"
import { getPublicEnv } from "@/shared/config/env"

export const dynamic = "force-dynamic"

// 학부모 앱 수신 동의(2차-3). 계약: docs/academy-marketing-consent-api.md.
const handle = createNativeMarketingConsentHandler({
  client: (token) => {
    const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
    return createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  },
  // 처리 결과 알림(정보통신망법 제50조 제7항)은 응답을 보낸 뒤 보낸다.
  onChanged: (change) => after(() => sendMarketingConsentNoticeSafely(change).then(() => undefined))
})

export const GET = handle
export const POST = handle
