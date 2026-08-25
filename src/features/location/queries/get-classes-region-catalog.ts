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

// "선택지로 보이는데 수업이 0개" 를 막기 위해 active class 를 가진 organization 만 catalog 에 넣는다.
// academy_area / classes.region 은 사용하지 않는다.
export const getClassesRegionCatalog = async (): Promise<RegionCatalog> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()

  const { data: classRows, error: classError } = await serviceRoleClient
    .from("classes")
    .select("organization_id")
    .eq("is_active", true)

  if (classError) {
    throw new Error("failed_to_fetch_active_class_organizations")
  }

  const organizationIds = Array.from(
    new Set(
      ((classRows ?? []) as Array<{ organization_id: string | null }>)
        .map((row) => row.organization_id)
        .filter((organizationId): organizationId is string => Boolean(organizationId))
    )
  )

  if (organizationIds.length === 0) {
    return []
  }

  const { data: organizationRows, error: organizationError } = await serviceRoleClient
    .from("organizations")
    .select("id, sido, sigungu, bname")
    .in("id", organizationIds)
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
