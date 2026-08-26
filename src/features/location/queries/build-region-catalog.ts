import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

import type { RegionCatalog } from "../lib/region-selection"

type OrganizationRegionRow = {
  id: string
  sido: string | null
  sigungu: string | null
  bname: string | null
}

const compareKorean = (left: string, right: string) => left.localeCompare(right, "ko")

// 공통화 대상은 "tree 생성" 뿐이다.
// 어떤 organization 을 노출할지(= id 집합)는 각 surface 의 query 가 스스로 정한다.
// academy_area / classes.region 은 사용하지 않는다.
export const buildRegionCatalogFromOrganizationIds = async (
  organizationIds: readonly string[]
): Promise<RegionCatalog> => {
  const uniqueOrganizationIds = Array.from(new Set(organizationIds.filter(Boolean)))
  if (uniqueOrganizationIds.length === 0) {
    return []
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data: organizationRows, error: organizationError } = await serviceRoleClient
    .from("organizations")
    .select("id, sido, sigungu, bname")
    .in("id", uniqueOrganizationIds)
    .not("sido", "is", null)

  if (organizationError) {
    throw new Error("failed_to_fetch_region_catalog_organizations")
  }

  const sidoMap = new Map<string, Map<string, Set<string>>>()

  for (const row of ((organizationRows ?? []) as unknown) as OrganizationRegionRow[]) {
    const sido = row.sido?.trim()
    if (!sido) {
      continue
    }

    const sigunguMap = sidoMap.get(sido) ?? new Map<string, Set<string>>()
    sidoMap.set(sido, sigunguMap)

    // metadata 깊이가 짧으면 그 단계까지만 catalog 에 들어간다.
    const sigungu = row.sigungu?.trim()
    if (!sigungu) {
      continue
    }

    const bnames = sigunguMap.get(sigungu) ?? new Set<string>()
    sigunguMap.set(sigungu, bnames)

    const bname = row.bname?.trim()
    if (bname) {
      bnames.add(bname)
    }
  }

  return Array.from(sidoMap.entries())
    .map(([sido, sigunguMap]) => ({
      sido,
      sigungus: Array.from(sigunguMap.entries())
        .map(([sigungu, bnames]) => ({
          sigungu,
          bnames: Array.from(bnames).sort(compareKorean)
        }))
        .sort((left, right) => compareKorean(left.sigungu, right.sigungu))
    }))
    .sort((left, right) => compareKorean(left.sido, right.sido))
}
