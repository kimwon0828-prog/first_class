import "server-only"

import { getAcademiesForList, type AcademyListItem } from "@/features/academies/queries/get-academies-for-list"
import { findNearbyOrganizations } from "@/features/location/queries/find-nearby-organizations"
import { findOrganizationIdsByAdministrativeRegion } from "@/features/location/queries/find-organizations-by-region"
import { readParentSearchLocation } from "@/features/location/lib/search-location-cookie"
import type { ClassDiscoveryContext } from "./resolve-class-discovery-context"

/** Reuse /academies discovery with the Home's canonical location, never the six-class preview. */
export async function getHomeAcademies(context: ClassDiscoveryContext): Promise<{ data: AcademyListItem[]; error: boolean }> {
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
    const data = await getAcademiesForList({ organizationIds, distanceByOrganizationId, sort: "name" })
    return { data: data.slice(0, 3), error: false }
  } catch {
    return { data: [], error: true }
  }
}
