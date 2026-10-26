import { PARENT_LAUNCH_REGION } from "@/features/location/lib/parent-launch-region"
import "server-only"

import { getAcademiesForList, type AcademyListItem } from "@/features/academies/queries/get-academies-for-list"
import { findNearbyOrganizations } from "@/features/location/queries/find-nearby-organizations"
import { findOrganizationIdsByAdministrativeRegion } from "@/features/location/queries/find-organizations-by-region"
import { readParentSearchLocation } from "@/features/location/lib/search-location-cookie"
import type { ClassDiscoveryContext } from "./resolve-class-discovery-context"

export type HomeAcademyListItem = AcademyListItem & { logoImageUrl: string | null }

/** Reuse /academies discovery with the Home's canonical location, never the six-class preview. */
export async function getHomeAcademies(context: ClassDiscoveryContext): Promise<{ data: HomeAcademyListItem[]; error: boolean }> {
  try {
    let organizationIds: string[] | undefined
    let distanceByOrganizationId: Map<string, number> | undefined
    if (context.isRegionMode && context.regionSelection) {
      organizationIds = await findOrganizationIdsByAdministrativeRegion(context.regionSelection)
    } else if (context.isNearbyMode) {
      const location = await readParentSearchLocation()
      if (!location) return { data: [], error: true }
      const nearby = await findNearbyOrganizations({ latitude: location.lat, longitude: location.lng, radiusKm: context.radiusKm })
      distanceByOrganizationId = new Map(nearby.map((item) => [item.organizationId, item.distanceKm]))
      organizationIds = [...distanceByOrganizationId.keys()]
    }
    // 로고는 /academies 와 같은 출처(같은 조회의 academy_public_profiles.logo_image_path)로 읽는다.
    const data = await getAcademiesForList({ organizationIds, distanceByOrganizationId, sort: "name", launchRegion: PARENT_LAUNCH_REGION, includeLogos: true })
    return { data: data.slice(0, 3).map(item => ({ ...item, logoImageUrl: item.logoImageUrl ?? null })), error: false }
  } catch {
    return { data: [], error: true }
  }
}
