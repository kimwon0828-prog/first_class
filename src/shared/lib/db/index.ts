import type { DataAdapter } from "@/shared/lib/db/adapter"
import { mockDataAdapter } from "@/shared/lib/db/mock-adapter"
import { supabaseDataAdapter } from "@/shared/lib/db/supabase-adapter"

const adapterMode = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock"

export const dataAdapter: DataAdapter =
  adapterMode === "supabase" ? supabaseDataAdapter : mockDataAdapter
