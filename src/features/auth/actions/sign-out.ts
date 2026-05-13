"use server"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

export const signOutAction = async (): Promise<void> => {
  const supabase = await getSupabaseServerClient()
  await supabase.auth.signOut()
}
