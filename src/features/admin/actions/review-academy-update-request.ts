"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireAdmin } from "@/features/admin/lib/require-admin"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

type AcademyUpdateSnapshot = {
  academyName: string | null
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

type AcademyUpdateRequestRow = {
  id: string
  organization_id: string
  status: "pending" | "approved" | "rejected"
  current_snapshot: unknown
  requested_snapshot: unknown
}

const RETURN_TO = "/admin/academy-update-requests"

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

const buildOrganizationPayload = (snapshot: AcademyUpdateSnapshot) => ({
  name: snapshot.academyName,
  representative_name: snapshot.representativeName,
  business_registration_number: snapshot.businessRegistrationNumber,
  business_registration_file_path: snapshot.businessRegistrationFilePath,
  academy_phone: snapshot.academyPhone,
  contact_phone: snapshot.contactPhone,
  postal_code: snapshot.postalCode,
  address_line1: snapshot.addressLine1,
  address_line2: snapshot.addressLine2,
  address: snapshot.addressLine1 ?? snapshot.address,
  address_detail: snapshot.addressLine2 ?? snapshot.addressDetail
})

const redirectWithError = (message: string): never => {
  redirect(`${RETURN_TO}?error=${encodeURIComponent(message)}`)
}

export async function approveAcademyUpdateRequestAction(formData: FormData) {
  const admin = await requireAdmin(RETURN_TO)
  const requestId = String(formData.get("requestId") ?? "").trim()
  const adminNote = String(formData.get("adminNote") ?? "").trim()

  if (!requestId) {
    redirectWithError("요청 ID가 없습니다.")
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("academy_update_requests")
    .select("id, organization_id, status, current_snapshot, requested_snapshot")
    .eq("id", requestId)
    .maybeSingle()

  if (error || !data) {
    redirectWithError("정보수정 요청을 찾지 못했습니다.")
  }

  const requestRow = data as unknown as AcademyUpdateRequestRow
  if (requestRow.status !== "pending") {
    redirectWithError("이미 처리된 요청입니다.")
  }

  const currentSnapshot = parseSnapshot(requestRow.current_snapshot)
  const requestedSnapshot = parseSnapshot(requestRow.requested_snapshot)

  const { error: organizationError } = await serviceRoleClient
    .from("organizations")
    .update(buildOrganizationPayload(requestedSnapshot))
    .eq("id", requestRow.organization_id)

  if (organizationError) {
    redirectWithError("organizations 반영에 실패했습니다.")
  }

  const reviewedAt = new Date().toISOString()
  const { error: requestUpdateError } = await serviceRoleClient
    .from("academy_update_requests")
    .update({
      status: "approved",
      reviewed_by: admin.id,
      reviewed_at: reviewedAt,
      admin_note: adminNote || null
    })
    .eq("id", requestId)
    .eq("status", "pending")

  if (requestUpdateError) {
    await serviceRoleClient
      .from("organizations")
      .update(buildOrganizationPayload(currentSnapshot))
      .eq("id", requestRow.organization_id)

    redirectWithError("요청 상태를 approved로 저장하지 못했습니다.")
  }

  revalidatePath("/admin/academy-update-requests")
  revalidatePath("/admin/academy-approvals")
  revalidatePath("/studio/settings")
}

export async function rejectAcademyUpdateRequestAction(formData: FormData) {
  const admin = await requireAdmin(RETURN_TO)
  const requestId = String(formData.get("requestId") ?? "").trim()
  const adminNote = String(formData.get("adminNote") ?? "").trim()

  if (!requestId) {
    redirectWithError("요청 ID가 없습니다.")
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("academy_update_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle()

  if (error || !data) {
    redirectWithError("정보수정 요청을 찾지 못했습니다.")
  }

  const requestRow = data as { id: string; status: "pending" | "approved" | "rejected" }

  if (requestRow.status !== "pending") {
    redirectWithError("이미 처리된 요청입니다.")
  }

  const { error: requestUpdateError } = await serviceRoleClient
    .from("academy_update_requests")
    .update({
      status: "rejected",
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      admin_note: adminNote || null
    })
    .eq("id", requestId)
    .eq("status", "pending")

  if (requestUpdateError) {
    redirectWithError("요청 상태를 rejected로 저장하지 못했습니다.")
  }

  revalidatePath("/admin/academy-update-requests")
  revalidatePath("/studio/settings")
}
