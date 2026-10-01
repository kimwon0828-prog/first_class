"use client"

import { useEffect } from "react"
import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import { bindFavoriteAccount } from "../lib/storage"

export function FavoriteAccountBoundary() {
  useEffect(() => {
    const { data: { subscription } } = getSupabaseBrowserClient().auth.onAuthStateChange((_event, session) => {
      // Cosmetic local state only; session metadata never authorizes DB access.
      try { bindFavoriteAccount(session?.user.id ?? null) } catch { /* Existing favorites UI reports inaccessible storage. */ }
    })
    return () => subscription.unsubscribe()
  }, [])
  return null
}
