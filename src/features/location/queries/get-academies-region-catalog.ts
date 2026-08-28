import "server-only"

import { unstable_cache } from "next/cache"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

import type { RegionCatalog } from "../lib/region-selection"
import { buildRegionCatalogFromOrganizationIds } from "./build-region-catalog"

// /academies 의 공개 조건은 "active class 를 1개 이상 가진 organization" 이다.
// getAcademiesForList 가 학원 목록을 active class 에서 파생시키므로, catalog 도 같은 조건을 쓴다.
// classes catalog 와 조건이 우연히 같더라도, 두 surface 의 노출 규칙은 각자 소유한다.
// academy_area 는 사용하지 않고 organizations.sido/sigungu/bname 만 사용한다.
const readGetAcademiesRegionCatalog = async (): Promise<RegionCatalog> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()

  const { data: classRows, error: classError } = await serviceRoleClient
    .from("classes")
    .select("organization_id")
    .eq("is_active", true)

  if (classError) {
    throw new Error("failed_to_fetch_public_academy_organizations")
  }

  const organizationIds = ((classRows ?? []) as Array<{ organization_id: string | null }>)
    .map((row) => row.organization_id)
    .filter((organizationId): organizationId is string => Boolean(organizationId))

  return buildRegionCatalogFromOrganizationIds(organizationIds)
}

export const getAcademiesRegionCatalog = unstable_cache(readGetAcademiesRegionCatalog, ["academies-region-catalog-v1"], {
  revalidate: 60,
  tags: ["academies-region-catalog-v1"]
})
