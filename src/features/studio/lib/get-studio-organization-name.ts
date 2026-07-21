import "server-only"

import { cache } from "react"

import { getSupabaseServerClient } from "@/integrations/supabase/server"

const getStudioOrganizationNameCached = cache(async (organizationId: string): Promise<string | null> => {
  try {
    const supabase = await getSupabaseServerClient()
    const { data } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle()

    return data?.name?.trim() || null
  } catch {
    return null
  }
})

export const getStudioOrganizationName = async (organizationId: string): Promise<string | null> =>
  getStudioOrganizationNameCached(organizationId)
