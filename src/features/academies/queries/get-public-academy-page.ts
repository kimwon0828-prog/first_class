import "server-only"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

const PROFILE_ASSET_BUCKET = "academy-profile-assets"

type OrganizationRow = {
  id: string
  name: string
  branch_name: string | null
  address: string | null
  address_detail: string | null
  address_line1: string | null
  address_line2: string | null
  academy_phone: string | null
  contact_phone: string | null
}

type AcademyPublicProfileRow = {
  organization_id: string
  slug: string | null
  logo_image_path: string | null
  cover_image_path: string | null
  short_description: string | null
  description: string | null
  operating_hours: string | null
  parking_info: string | null
  directions: string | null
}

export type PublicAcademyPageData = {
  organizationId: string
  slug: string | null
  name: string
  branchName: string | null
  address: string | null
  phone: string | null
  logoImagePath: string | null
  logoImageUrl: string | null
  coverImagePath: string | null
  coverImageUrl: string | null
  shortDescription: string | null
  description: string | null
  operatingHours: string | null
  parkingInfo: string | null
  directions: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const toNullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

const isUuid = (value: string) => UUID_PATTERN.test(value)

const buildPublicUrl = (path: string | null) => {
  if (!path) {
    return null
  }

  const {
    data: { publicUrl }
  } = getSupabaseServiceRoleClient().storage.from(PROFILE_ASSET_BUCKET).getPublicUrl(path)

  return publicUrl || null
}

const formatOrganizationAddress = (organization: OrganizationRow) => {
  const primaryAddress = toNullableText(organization.address)
  const primaryDetail = toNullableText(organization.address_detail)
  if (primaryAddress || primaryDetail) {
    return [primaryAddress, primaryDetail].filter((value): value is string => Boolean(value)).join(" ")
  }

  const line1 = toNullableText(organization.address_line1)
  const line2 = toNullableText(organization.address_line2)
  return [line1, line2].filter((value): value is string => Boolean(value)).join(" ") || null
}

const fetchAcademyPublicProfileBySlug = async (slug: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("academy_public_profiles")
    .select(
      [
        "organization_id",
        "slug",
        "logo_image_path",
        "cover_image_path",
        "short_description",
        "description",
        "operating_hours",
        "parking_info",
        "directions"
      ].join(", ")
    )
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_public_academy_profile_by_slug")
  }

  return (data as AcademyPublicProfileRow | null) ?? null
}

const fetchAcademyPublicProfileByOrganizationId = async (organizationId: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("academy_public_profiles")
    .select(
      [
        "organization_id",
        "slug",
        "logo_image_path",
        "cover_image_path",
        "short_description",
        "description",
        "operating_hours",
        "parking_info",
        "directions"
      ].join(", ")
    )
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_public_academy_profile_by_organization")
  }

  return (data as AcademyPublicProfileRow | null) ?? null
}

const fetchOrganization = async (organizationId: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("organizations")
    .select(
      [
        "id",
        "name",
        "branch_name",
        "address",
        "address_detail",
        "address_line1",
        "address_line2",
        "academy_phone",
        "contact_phone"
      ].join(", ")
    )
    .eq("id", organizationId)
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_public_academy_organization")
  }

  return (data as OrganizationRow | null) ?? null
}

export const getPublicAcademyPageByHandle = async (handle: string): Promise<PublicAcademyPageData | null> => {
  const normalizedHandle = handle.trim()
  if (!normalizedHandle) {
    return null
  }

  const profileBySlug = await fetchAcademyPublicProfileBySlug(normalizedHandle)
  const organizationId = profileBySlug?.organization_id ?? (isUuid(normalizedHandle) ? normalizedHandle : null)

  if (!organizationId) {
    return null
  }

  const organization = await fetchOrganization(organizationId)
  if (!organization) {
    return null
  }

  const publicProfile = profileBySlug ?? (await fetchAcademyPublicProfileByOrganizationId(organizationId))

  return {
    organizationId: organization.id,
    slug: toNullableText(publicProfile?.slug),
    name: organization.name,
    branchName: toNullableText(organization.branch_name),
    address: formatOrganizationAddress(organization),
    phone: toNullableText(organization.academy_phone) ?? toNullableText(organization.contact_phone),
    logoImagePath: toNullableText(publicProfile?.logo_image_path),
    logoImageUrl: buildPublicUrl(toNullableText(publicProfile?.logo_image_path)),
    coverImagePath: toNullableText(publicProfile?.cover_image_path),
    coverImageUrl: buildPublicUrl(toNullableText(publicProfile?.cover_image_path)),
    shortDescription: toNullableText(publicProfile?.short_description),
    description: toNullableText(publicProfile?.description),
    operatingHours: toNullableText(publicProfile?.operating_hours),
    parkingInfo: toNullableText(publicProfile?.parking_info),
    directions: toNullableText(publicProfile?.directions)
  }
}
