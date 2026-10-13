import { createClient } from "@supabase/supabase-js"
import { getPublicEnv } from "@/shared/config/env"
import { createNativePushDeviceHandler } from "@/features/native/server/push-device"

export const dynamic = "force-dynamic"

const handle = createNativePushDeviceHandler({
  client: (token) => {
    const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
    return createClient(supabaseUrl, supabasePublishableKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  },
  enabled: () => process.env.PARENT_PUSH_REGISTRATION_ENABLED === "true"
})

export const GET = handle
export const POST = handle
