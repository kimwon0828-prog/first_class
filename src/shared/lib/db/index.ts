import type { DataAdapter } from "@/shared/lib/db/adapter"
import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"
import { supabaseDataAdapter } from "@/shared/lib/db/supabase-adapter"

const hasSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
)

const adapterMode = process.env.NEXT_PUBLIC_DATA_SOURCE ?? (hasSupabaseEnv ? "supabase" : "mock")

export const dataAdapter: DataAdapter =
  adapterMode === "supabase" ? supabaseDataAdapter : mockDataAdapter
