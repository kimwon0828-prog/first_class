import { createClient } from "@supabase/supabase-js"

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
  }
})

export const GET = handle
export const POST = handle
