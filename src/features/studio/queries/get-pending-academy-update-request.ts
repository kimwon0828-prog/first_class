"use server"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export type AcademyUpdateSnapshot = {
  academyName: string | null
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
  teacherPhone: string | null
}

export type PendingAcademyUpdateRequest = {
  id: string
  organizationId: string
  requesterProfileId: string
  status: "pending"
  requestedAcademyName: string | null
  requestedRepresentativeName: string | null
  requestedBusinessRegistrationNumber: string | null
  requestedBusinessRegistrationFilePath: string | null
  requestedAcademyPhone: string | null
  requestedContactPhone: string | null
  requestedPostalCode: string | null
  requestedAddressLine1: string | null
  requestedAddressLine2: string | null
  currentSnapshot: AcademyUpdateSnapshot
  requestedSnapshot: AcademyUpdateSnapshot
  adminNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

type PendingAcademyUpdateRequestRow = {
  id: string
  organization_id: string
  requester_profile_id: string
  status: "pending"
  requested_academy_name: string | null
  requested_representative_name: string | null
  requested_business_registration_number: string | null
  requested_business_registration_file_path: string | null
  requested_academy_phone: string | null
  requested_contact_phone: string | null
  requested_postal_code: string | null
  requested_address_line1: string | null
  requested_address_line2: string | null
  current_snapshot: unknown
  requested_snapshot: unknown
  admin_note: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

const toNullableText = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const parseSnapshot = (value: unknown): AcademyUpdateSnapshot => {
  const record =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

  return {
    academyName: toNullableText(record.academyName),
    academyArea: toNullableText(record.academyArea),
    branchName: toNullableText(record.branchName),
    representativeName: toNullableText(record.representativeName),
    businessRegistrationNumber: toNullableText(record.businessRegistrationNumber),
    businessRegistrationFilePath: toNullableText(record.businessRegistrationFilePath),
    academyPhone: toNullableText(record.academyPhone),
    contactPhone: toNullableText(record.contactPhone),
    postalCode: toNullableText(record.postalCode),
    addressLine1: toNullableText(record.addressLine1),
    addressLine2: toNullableText(record.addressLine2),
    address: toNullableText(record.address),
    addressDetail: toNullableText(record.addressDetail),
    organizationPhone: toNullableText(record.organizationPhone),
    teacherPhone: toNullableText(record.teacherPhone)
  }
}

export const getPendingAcademyUpdateRequest = async (
  organizationId: string
): Promise<PendingAcademyUpdateRequest | null> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("academy_update_requests")
    .select(
      [
        "id",
        "organization_id",
        "requester_profile_id",
        "status",
        "requested_academy_name",
        "requested_representative_name",
        "requested_business_registration_number",
        "requested_business_registration_file_path",
        "requested_academy_phone",
        "requested_contact_phone",
        "requested_postal_code",
        "requested_address_line1",
        "requested_address_line2",
        "current_snapshot",
        "requested_snapshot",
        "admin_note",
        "reviewed_at",
        "created_at",
        "updated_at"
      ].join(", ")
    )
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .maybeSingle()

  if (error) {
    throw new Error("failed_to_fetch_pending_academy_update_request")
  }

  if (!data) {
    return null
  }

  const row = data as unknown as PendingAcademyUpdateRequestRow

  return {
    id: row.id,
    organizationId: row.organization_id,
    requesterProfileId: row.requester_profile_id,
    status: row.status,
    requestedAcademyName: row.requested_academy_name,
    requestedRepresentativeName: row.requested_representative_name,
    requestedBusinessRegistrationNumber: row.requested_business_registration_number,
    requestedBusinessRegistrationFilePath: row.requested_business_registration_file_path,
    requestedAcademyPhone: row.requested_academy_phone,
    requestedContactPhone: row.requested_contact_phone,
    requestedPostalCode: row.requested_postal_code,
    requestedAddressLine1: row.requested_address_line1,
    requestedAddressLine2: row.requested_address_line2,
    currentSnapshot: parseSnapshot(row.current_snapshot),
    requestedSnapshot: parseSnapshot(row.requested_snapshot),
    adminNote: row.admin_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
