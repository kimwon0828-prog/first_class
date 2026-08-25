import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

import type { RegionSelection } from "../lib/region-selection"

// 행정지역 metadata 만으로 organization 을 찾는다.
// academy_area / classes.region 을 사용하지 않으며 새 RPC 도 만들지 않는다.
export const findOrganizationIdsByAdministrativeRegion = async (
  selection: RegionSelection
): Promise<string[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()

  let query = serviceRoleClient.from("organizations").select("id").eq("sido", selection.sido)

  if (selection.sigungu) {
    query = query.eq("sigungu", selection.sigungu)
  }

  if (selection.bname) {
    query = query.eq("bname", selection.bname)
  }

  const { data, error } = await query

  if (error) {
    throw new Error("failed_to_find_organizations_by_region")
  }

  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id)
}
