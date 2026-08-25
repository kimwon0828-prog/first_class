import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export type NearbyOrganization = {
  organizationId: string
  distanceKm: number
}

// Phase 2A RPC 는 service_role 전용이다. 브라우저에서 직접 호출하지 않는다.
const NEARBY_ORGANIZATION_LIMIT = 200

export const findNearbyOrganizations = async (params: {
  latitude: number
  longitude: number
  radiusKm: number
  limit?: number
  offset?: number
}): Promise<NearbyOrganization[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient.rpc("find_nearby_organizations", {
    origin_lat: params.latitude,
    origin_lng: params.longitude,
    radius_km: params.radiusKm,
    limit_count: Math.min(Math.max(params.limit ?? NEARBY_ORGANIZATION_LIMIT, 1), 500),
    offset_count: Math.max(params.offset ?? 0, 0)
  })

  if (error) {
    throw new Error("failed_to_find_nearby_organizations")
  }

  return (((data ?? []) as unknown) as Array<{ organization_id: string; distance_km: number }>).map(
    (row) => ({
      organizationId: row.organization_id,
      distanceKm: row.distance_km
    })
  )
}
