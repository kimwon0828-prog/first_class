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

/*
 * 주소 + 상세주소를 잇는다.
 *
 * ⚠️ 데이터에 따라 address 가 이미 상세주소를 끝에 달고 들어온다
 *    ("... 중계로 225 청구상가 4층" + "청구상가 4층"). 그대로 이으면 같은 말이 두 번 나온다.
 *    공백만 고른 뒤 "정확히 같은 꼬리" 일 때만 재부착을 생략한다 —
 *    부분 문자열 추측이나 주소 parsing 은 하지 않는다. 그건 다른 주소를 망가뜨린다.
 * ⚠️ Production 데이터는 고치지 않는다. 표시 단계에서만 겹침을 없앤다.
 */
const collapseSpaces = (value: string) => value.replace(/\s+/g, " ").trim()

const joinAddressParts = (base: string | null, detail: string | null) => {
  if (!base) return detail
  if (!detail) return base
  return collapseSpaces(base).endsWith(collapseSpaces(detail)) ? base : `${base} ${detail}`
}

const formatOrganizationAddress = (organization: OrganizationRow) => {
  const primaryAddress = toNullableText(organization.address)
  const primaryDetail = toNullableText(organization.address_detail)
  if (primaryAddress || primaryDetail) {
    return joinAddressParts(primaryAddress, primaryDetail)
  }

  const line1 = toNullableText(organization.address_line1)
  const line2 = toNullableText(organization.address_line2)
  return joinAddressParts(line1, line2)
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
