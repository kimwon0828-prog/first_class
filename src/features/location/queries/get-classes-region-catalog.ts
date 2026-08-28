import "server-only"

import { unstable_cache } from "next/cache"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

import type { RegionCatalog } from "../lib/region-selection"
import { buildRegionCatalogFromOrganizationIds } from "./build-region-catalog"

// "선택지로 보이는데 수업이 0개" 를 막기 위해 active class 를 가진 organization 만 catalog 에 넣는다.
// academy_area / classes.region 은 사용하지 않는다.
const readGetClassesRegionCatalog = async (): Promise<RegionCatalog> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()

  const { data: classRows, error: classError } = await serviceRoleClient
    .from("classes")
    .select("organization_id")
    .eq("is_active", true)

  if (classError) {
    throw new Error("failed_to_fetch_active_class_organizations")
  }

  const organizationIds = ((classRows ?? []) as Array<{ organization_id: string | null }>)
    .map((row) => row.organization_id)
    .filter((organizationId): organizationId is string => Boolean(organizationId))

  return buildRegionCatalogFromOrganizationIds(organizationIds)
}

export const getClassesRegionCatalog = unstable_cache(readGetClassesRegionCatalog, ["classes-region-catalog-v1"], {
  revalidate: 60,
  tags: ["classes-region-catalog-v1"]
})
