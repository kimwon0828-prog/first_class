"use server"

import { normalizeProfileRole } from "@/features/auth/lib/profile-sync"
import type { TeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export type StudioSettingsOrganization = {
  id: string
  actorRole: string | null
  name: string
  academyArea: string | null
  branchName: string | null
  representativeName: string | null
  businessRegistrationNumber: string | null
  businessRegistrationFilePath: string | null
  academyPhone: string | null
  contactPhone: string | null
  postalCode: string | null
  addressLine1: string | null
  addressLine2: string | null
  address: string | null
  addressDetail: string | null
  organizationPhone: string | null
}

type ProfileRoleRow = {
  role: string | null
}

type OrganizationRow = {
  id: string
  name: string
  academy_area: string | null
  branch_name: string | null
  representative_name: string | null
  business_registration_number: string | null
  business_registration_file_path: string | null
  academy_phone: string | null
  contact_phone: string | null
  postal_code: string | null
  address_line1: string | null
  address_line2: string | null
  address: string | null
  address_detail: string | null
}

export const getStudioSettingsOrganization = async (
  access: TeacherStudioAccess
): Promise<StudioSettingsOrganization> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()

  const { data: profileData, error: profileError } = await serviceRoleClient
    .from("profiles")
    .select("role")
    .eq("id", access.id)
    .maybeSingle()

  if (profileError || !profileData) {
    throw new Error("failed_to_fetch_studio_profile_role")
  }

  const { data: organizationData, error: organizationError } = await serviceRoleClient
    .from("organizations")
    .select(
      [
        "id",
        "name",
        "academy_area",
        "branch_name",
        "representative_name",
        "business_registration_number",
        "business_registration_file_path",
        "academy_phone",
        "contact_phone",
        "postal_code",
        "address_line1",
        "address_line2",
        "address",
        "address_detail"
      ].join(", ")
    )
    .eq("id", access.organizationId)
    .maybeSingle()

  if (organizationError || !organizationData) {
    throw new Error("failed_to_fetch_studio_organization")
  }

  const profileRole = profileData as unknown as ProfileRoleRow
  const organization = organizationData as unknown as OrganizationRow
  const normalizedRole = normalizeProfileRole(profileRole.role)

  return {
    id: organization.id,
    actorRole: normalizedRole?.dbRole ?? null,
    name: organization.name,
    academyArea: organization.academy_area,
    branchName: organization.branch_name,
    representativeName: organization.representative_name,
    businessRegistrationNumber: organization.business_registration_number,
    businessRegistrationFilePath: organization.business_registration_file_path,
    academyPhone: organization.academy_phone,
    contactPhone: organization.contact_phone,
    postalCode: organization.postal_code,
    addressLine1: organization.address_line1,
    addressLine2: organization.address_line2,
    address: organization.address,
    addressDetail: organization.address_detail,
    organizationPhone: organization.academy_phone
  }
}
