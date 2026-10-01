import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

import { getAcademiesForList, type AcademyListItem } from "@/features/academies/queries/get-academies-for-list"
import { findNearbyOrganizations } from "@/features/location/queries/find-nearby-organizations"
import { findOrganizationIdsByAdministrativeRegion } from "@/features/location/queries/find-organizations-by-region"
import { readParentSearchLocation } from "@/features/location/lib/search-location-cookie"
import type { ClassDiscoveryContext } from "./resolve-class-discovery-context"

export type HomeAcademyListItem = AcademyListItem & { logoImageUrl: string | null }

async function withPublicLogos(items: AcademyListItem[]): Promise<HomeAcademyListItem[]> {
  const fallback = items.map(item => ({ ...item, logoImageUrl: null }))
  if (!items.length) return fallback
  try {
    const client = getSupabaseServiceRoleClient()
    const { data, error } = await client.from("academy_public_profiles")
      .select("organization_id, logo_image_path").in("organization_id", items.map(item => item.id))
    if (error) return fallback
    const paths = new Map((data ?? []).map(row => [row.organization_id, row.logo_image_path]))
    return items.map(item => {
      const path = paths.get(item.id)
      const logoImageUrl = typeof path === "string" && path.trim()
        ? client.storage.from("academy-profile-assets").getPublicUrl(path.trim()).data.publicUrl || null : null
      return { ...item, logoImageUrl }
    })
  } catch { return fallback } // Optional media failure must not remove discovery rows.
}

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
    const data = await getAcademiesForList({ organizationIds, distanceByOrganizationId, sort: "name" })
    return { data: await withPublicLogos(data.slice(0, 3)), error: false }
  } catch {
    return { data: [], error: true }
  }
}
