"use server"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

const BUSINESS_REGISTRATION_SIGNED_URL_TTL_SECONDS = 60 * 5

export type AcademyUpdateRequestSnapshot = {
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

export type AcademyUpdateRequestView = {
  requestId: string
  organizationId: string
  requesterProfileId: string
  requesterName: string | null
  createdAt: string
  status: "pending"
  adminNote: string | null
  currentSnapshot: AcademyUpdateRequestSnapshot
  requestedSnapshot: AcademyUpdateRequestSnapshot
  requestedBusinessRegistrationFilePath: string | null
  requestedBusinessRegistrationSignedUrl: string | null
  requestedBusinessRegistrationSignedUrlError: string | null
}

type AcademyUpdateRequestRow = {
  id: string
  organization_id: string
  requester_profile_id: string
  status: "pending"
  current_snapshot: unknown
  requested_snapshot: unknown
  requested_business_registration_file_path: string | null
  admin_note: string | null
  created_at: string
}

type RequesterProfileRow = {
  id: string
  name: string | null
}

const toNullableText = (value: unknown) => {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const parseSnapshot = (value: unknown): AcademyUpdateRequestSnapshot => {
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

export const getAcademyUpdateRequests = async (): Promise<AcademyUpdateRequestView[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("academy_update_requests")
    .select(
      [
        "id",
        "organization_id",
        "requester_profile_id",
        "status",
        "current_snapshot",
        "requested_snapshot",
        "requested_business_registration_file_path",
        "admin_note",
        "created_at"
      ].join(", ")
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (error) {
    throw new Error("failed_to_fetch_academy_update_requests")
  }

  const rows = (data ?? []) as unknown as AcademyUpdateRequestRow[]
  const requesterIds = Array.from(new Set(rows.map((row) => row.requester_profile_id)))
  let requesterNameMap = new Map<string, string | null>()

  if (requesterIds.length > 0) {
    const { data: requesterData, error: requesterError } = await serviceRoleClient
      .from("profiles")
      .select("id, name")
      .in("id", requesterIds)

    if (!requesterError) {
      requesterNameMap = new Map(
        ((requesterData ?? []) as unknown as RequesterProfileRow[]).map((row) => [row.id, row.name])
      )
    }
  }

  return Promise.all(
    rows.map(async (row) => {
      const filePath = row.requested_business_registration_file_path?.trim() ?? null
      let requestedBusinessRegistrationSignedUrl: string | null = null
      let requestedBusinessRegistrationSignedUrlError: string | null = null

      if (filePath) {
        const { data: signedUrlData, error: signedUrlError } = await serviceRoleClient.storage
          .from("academy-documents")
          .createSignedUrl(filePath, BUSINESS_REGISTRATION_SIGNED_URL_TTL_SECONDS)

        if (signedUrlError) {
          requestedBusinessRegistrationSignedUrlError = signedUrlError.message
        } else {
          requestedBusinessRegistrationSignedUrl = signedUrlData.signedUrl
        }
      }

      return {
        requestId: row.id,
        organizationId: row.organization_id,
        requesterProfileId: row.requester_profile_id,
        requesterName: requesterNameMap.get(row.requester_profile_id) ?? null,
        createdAt: row.created_at,
        status: row.status,
        adminNote: row.admin_note,
        currentSnapshot: parseSnapshot(row.current_snapshot),
        requestedSnapshot: parseSnapshot(row.requested_snapshot),
        requestedBusinessRegistrationFilePath: filePath,
        requestedBusinessRegistrationSignedUrl,
        requestedBusinessRegistrationSignedUrlError
      }
    })
  )
}
