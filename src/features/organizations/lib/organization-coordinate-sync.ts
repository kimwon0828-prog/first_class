import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

import { geocodeAddressOnServer } from "./naver-geocoding"

type OrganizationCoordinateRow = {
  id: string
  name: string
  branch_name: string | null
  academy_area: string | null
  address_line1: string | null
  address_line2: string | null
  address: string | null
  address_detail: string | null
  latitude: number | null
  longitude: number | null
}

export type OrganizationCoordinateSyncResult = {
  organizationId: string
  organizationName: string
  addressForGeocoding: string | null
  status: "updated" | "skipped_missing_address" | "not_found" | "not_geocoded"
  latitude: number | null
  longitude: number | null
}

const ORGANIZATION_COORDINATE_SELECT = [
  "id",
  "name",
  "branch_name",
  "academy_area",
  "address_line1",
  "address_line2",
  "address",
  "address_detail",
  "latitude",
  "longitude"
].join(", ")

const normalizeText = (value: string | null | undefined) => (value ?? "").replace(/\s+/g, " ").trim()

export const buildOrganizationAddressForGeocoding = (organization: {
  address_line1?: string | null
  address_line2?: string | null
  address?: string | null
  address_detail?: string | null
  academy_area?: string | null
}) => {
  const primaryLine1 = normalizeText(organization.address_line1)
  const primaryLine2 = normalizeText(organization.address_line2)
  if (primaryLine1) {
    return [primaryLine1, primaryLine2].filter(Boolean).join(" ").trim()
  }

  const legacyAddress = normalizeText(organization.address)
  const legacyDetail = normalizeText(organization.address_detail)
  if (legacyAddress) {
    return [legacyAddress, legacyDetail].filter(Boolean).join(" ").trim()
  }

  const academyArea = normalizeText(organization.academy_area)
  return academyArea || null
}

const buildOrganizationName = (organization: Pick<OrganizationCoordinateRow, "name" | "branch_name">) =>
  [organization.name, organization.branch_name].filter(Boolean).join(" ").trim() || organization.name

const mapSyncResult = (
  organization: OrganizationCoordinateRow,
  status: OrganizationCoordinateSyncResult["status"],
  coordinates?: { latitude: number; longitude: number } | null
): OrganizationCoordinateSyncResult => ({
  organizationId: organization.id,
  organizationName: buildOrganizationName(organization),
  addressForGeocoding: buildOrganizationAddressForGeocoding(organization),
  status,
  latitude: coordinates?.latitude ?? organization.latitude ?? null,
  longitude: coordinates?.longitude ?? organization.longitude ?? null
})

export const syncOrganizationCoordinatesById = async (
  organizationId: string
): Promise<OrganizationCoordinateSyncResult> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select(ORGANIZATION_COORDINATE_SELECT)
    .eq("id", organizationId)
    .maybeSingle()

  if (error || !data) {
    return {
      organizationId,
      organizationName: "학원 정보 준비 중",
      addressForGeocoding: null,
      status: "not_found",
      latitude: null,
      longitude: null
    }
  }

  const organization = (data as unknown) as OrganizationCoordinateRow
  const addressForGeocoding = buildOrganizationAddressForGeocoding(organization)
  if (!addressForGeocoding) {
    return mapSyncResult(organization, "skipped_missing_address")
  }

  const coordinates = await geocodeAddressOnServer(addressForGeocoding)
  if (!coordinates) {
    return mapSyncResult(organization, "not_geocoded")
  }

  const { error: updateError } = await serviceRoleClient
    .from("organizations")
    .update({
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      map_updated_at: new Date().toISOString()
    })
    .eq("id", organization.id)

  if (updateError) {
    throw new Error("failed_to_update_organization_coordinates")
  }

  return mapSyncResult(organization, "updated", coordinates)
}

export const syncMissingOrganizationCoordinates = async (limit = 20) => {
  const safeLimit = Math.min(Math.max(limit, 1), 100)
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select(ORGANIZATION_COORDINATE_SELECT)
    .or("latitude.is.null,longitude.is.null")
    .order("created_at", { ascending: true })
    .limit(safeLimit)

  if (error) {
    throw new Error("failed_to_list_missing_organization_coordinates")
  }

  const organizations = (((data ?? []) as unknown) as OrganizationCoordinateRow[])
  const results: OrganizationCoordinateSyncResult[] = []

  for (const organization of organizations) {
    const result = await syncOrganizationCoordinatesById(organization.id)
    results.push(result)
  }

  return results
}
