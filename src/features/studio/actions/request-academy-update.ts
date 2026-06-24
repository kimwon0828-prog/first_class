"use server"

import { revalidatePath } from "next/cache"
import type { SupabaseClient } from "@supabase/supabase-js"

import { requireTeacherStudioAccess } from "@/features/studio/lib/require-teacher-studio-access"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export type RequestAcademyUpdateActionState = {
  status: "idle" | "success" | "error"
  message: string
}

const defaultState: RequestAcademyUpdateActionState = {
  status: "idle",
  message: ""
}

const MAX_BUSINESS_REGISTRATION_FILE_SIZE = 5 * 1024 * 1024
const BUSINESS_REGISTRATION_MIME_TO_EXTENSION = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const

const phonePattern = /^[0-9+\-()\s]+$/
const businessRegistrationNumberPattern = /^[0-9-\s]+$/
const postalCodePattern = /^[0-9A-Za-z-\s]+$/

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

type ProfileRoleRow = {
  role: string | null
}

type InsertedAcademyUpdateRequestRow = {
  id: string
}

type AcademyUpdateSnapshot = {
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

const isAllowedBusinessRegistrationMime = (
  value: string
): value is keyof typeof BUSINESS_REGISTRATION_MIME_TO_EXTENSION =>
  value in BUSINESS_REGISTRATION_MIME_TO_EXTENSION

const toNullableText = (value: string) => {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const validatePhone = (value: string, label: string) => {
  if (value.length < 7 || value.length > 20 || !phonePattern.test(value)) {
    return `${label}를 올바르게 입력해 주세요.`
  }

  return null
}

const buildSnapshot = (input: {
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
}) => ({
  academyName: input.academyName,
  academyArea: input.academyArea,
  branchName: input.branchName,
  representativeName: input.representativeName,
  businessRegistrationNumber: input.businessRegistrationNumber,
  businessRegistrationFilePath: input.businessRegistrationFilePath,
  academyPhone: input.academyPhone,
  contactPhone: input.contactPhone,
  postalCode: input.postalCode,
  addressLine1: input.addressLine1,
  addressLine2: input.addressLine2,
  address: input.addressLine1,
  addressDetail: input.addressLine2,
  organizationPhone: input.academyPhone,
  teacherPhone: input.contactPhone
}) satisfies AcademyUpdateSnapshot

const hasSnapshotChanged = (current: AcademyUpdateSnapshot, next: AcademyUpdateSnapshot) =>
  JSON.stringify(current) !== JSON.stringify(next)

const validateForm = (formData: FormData) => {
  const academyName = String(formData.get("academyName") ?? "").trim()
  const representativeName = String(formData.get("representativeName") ?? "").trim()
  const businessRegistrationNumber = String(formData.get("businessRegistrationNumber") ?? "").trim()
  const academyPhone = String(formData.get("academyPhone") ?? "").trim()
  const contactPhone = String(formData.get("contactPhone") ?? "").trim()
  const postalCode = String(formData.get("postalCode") ?? "").trim()
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim()
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim()
  const businessRegistrationFile = formData.get("businessRegistrationFile")

  if (academyName.length < 2 || academyName.length > 50) {
    return { ok: false as const, message: "학원명은 2자 이상 50자 이하로 입력해 주세요." }
  }

  if (representativeName.length < 2 || representativeName.length > 40) {
    return { ok: false as const, message: "대표자명은 2자 이상 40자 이하로 입력해 주세요." }
  }

  if (
    businessRegistrationNumber.length < 10 ||
    businessRegistrationNumber.length > 20 ||
    !businessRegistrationNumberPattern.test(businessRegistrationNumber)
  ) {
    return { ok: false as const, message: "사업자등록번호를 올바르게 입력해 주세요." }
  }

  const academyPhoneError = validatePhone(academyPhone, "학원 대표 전화번호")
  if (academyPhoneError) {
    return { ok: false as const, message: academyPhoneError }
  }

  const contactPhoneError = validatePhone(contactPhone, "담당자 전화번호")
  if (contactPhoneError) {
    return { ok: false as const, message: contactPhoneError }
  }

  if (postalCode && (postalCode.length > 20 || !postalCodePattern.test(postalCode))) {
    return { ok: false as const, message: "우편번호를 올바르게 입력해 주세요." }
  }

  if (!addressLine1 || addressLine1.length > 120) {
    return { ok: false as const, message: "기본 주소를 입력해 주세요." }
  }

  if (addressLine2.length > 120) {
    return { ok: false as const, message: "상세 주소는 120자 이하로 입력해 주세요." }
  }

  const selectedFile =
    businessRegistrationFile instanceof File && businessRegistrationFile.size > 0
      ? businessRegistrationFile
      : null

  if (selectedFile) {
    if (selectedFile.size > MAX_BUSINESS_REGISTRATION_FILE_SIZE) {
      return { ok: false as const, message: "사업자등록증 이미지는 5MB 이하만 업로드할 수 있습니다." }
    }

    if (!isAllowedBusinessRegistrationMime(selectedFile.type)) {
      return {
        ok: false as const,
        message: "사업자등록증 이미지는 JPG, PNG, WEBP 형식만 업로드할 수 있습니다."
      }
    }
  }

  return {
    ok: true as const,
    academyName,
    representativeName,
    businessRegistrationNumber,
    academyPhone,
    contactPhone,
    postalCode: toNullableText(postalCode),
    addressLine1,
    addressLine2: toNullableText(addressLine2),
    businessRegistrationFile: selectedFile
  }
}

const deleteAcademyUpdateRequest = async (supabase: SupabaseClient, requestId: string) => {
  await supabase.from("academy_update_requests").delete().eq("id", requestId)
}

export async function requestAcademyUpdateAction(
  previousState: RequestAcademyUpdateActionState = defaultState,
  formData: FormData
): Promise<RequestAcademyUpdateActionState> {
  void previousState
  const validated = validateForm(formData)

  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const access = await requireTeacherStudioAccess()
  const serviceRoleClient = getSupabaseServiceRoleClient()

  const { data: profileData, error: profileError } = await serviceRoleClient
    .from("profiles")
    .select("role")
    .eq("id", access.id)
    .maybeSingle()

  if (profileError || !profileData) {
    return { status: "error", message: "요청 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }
  }

  const profile = profileData as unknown as ProfileRoleRow
  if (profile.role !== "academy") {
    return { status: "error", message: "학원 대표 계정만 정보수정 요청을 제출할 수 있습니다." }
  }

  const { data: existingPendingData, error: pendingError } = await serviceRoleClient
    .from("academy_update_requests")
    .select("id")
    .eq("organization_id", access.organizationId)
    .eq("status", "pending")
    .maybeSingle()

  if (pendingError) {
    return { status: "error", message: "기존 요청 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }
  }

  if (existingPendingData) {
    return { status: "error", message: "이미 관리자 검토 중인 정보수정 요청이 있습니다." }
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
    return { status: "error", message: "현재 학원 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }
  }

  const organization = organizationData as unknown as OrganizationRow
  const currentSnapshot = buildSnapshot({
    academyName: organization.name,
    academyArea: organization.academy_area,
    branchName: organization.branch_name,
    representativeName: organization.representative_name,
    businessRegistrationNumber: organization.business_registration_number,
    businessRegistrationFilePath: organization.business_registration_file_path,
    academyPhone: organization.academy_phone,
    contactPhone: organization.contact_phone,
    postalCode: organization.postal_code,
    addressLine1: organization.address_line1 ?? organization.address,
    addressLine2: organization.address_line2 ?? organization.address_detail
  })

  const requestedSnapshot = buildSnapshot({
    academyName: validated.academyName,
    academyArea: organization.academy_area,
    branchName: organization.branch_name,
    representativeName: validated.representativeName,
    businessRegistrationNumber: validated.businessRegistrationNumber,
    businessRegistrationFilePath: organization.business_registration_file_path,
    academyPhone: validated.academyPhone,
    contactPhone: validated.contactPhone,
    postalCode: validated.postalCode,
    addressLine1: validated.addressLine1,
    addressLine2: validated.addressLine2
  })

  if (!validated.businessRegistrationFile && !hasSnapshotChanged(currentSnapshot, requestedSnapshot)) {
    return { status: "error", message: "변경된 정보가 없습니다. 수정할 내용을 입력해 주세요." }
  }

  const insertPayload = {
    organization_id: access.organizationId,
    requester_profile_id: access.id,
    status: "pending" as const,
    requested_academy_name: validated.academyName,
    requested_representative_name: validated.representativeName,
    requested_business_registration_number: validated.businessRegistrationNumber,
    requested_business_registration_file_path: organization.business_registration_file_path,
    requested_academy_phone: validated.academyPhone,
    requested_contact_phone: validated.contactPhone,
    requested_postal_code: validated.postalCode,
    requested_address_line1: validated.addressLine1,
    requested_address_line2: validated.addressLine2,
    current_snapshot: currentSnapshot,
    requested_snapshot: requestedSnapshot
  }

  const { data: insertedData, error: insertError } = await serviceRoleClient
    .from("academy_update_requests")
    .insert(insertPayload)
    .select("id")
    .single()

  if (insertError || !insertedData) {
    const isDuplicatePending = insertError?.code === "23505"
    return {
      status: "error",
      message: isDuplicatePending
        ? "이미 관리자 검토 중인 정보수정 요청이 있습니다."
        : "정보수정 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  const insertedRequest = insertedData as unknown as InsertedAcademyUpdateRequestRow
  let uploadedObjectPath: string | null = null

  if (validated.businessRegistrationFile) {
    const fileExtension =
      BUSINESS_REGISTRATION_MIME_TO_EXTENSION[
        validated.businessRegistrationFile.type as keyof typeof BUSINESS_REGISTRATION_MIME_TO_EXTENSION
      ]
    uploadedObjectPath = [
      "academy-update-requests",
      insertedRequest.id,
      "business-registration",
      `${crypto.randomUUID()}.${fileExtension}`
    ].join("/")

    const { error: uploadError } = await serviceRoleClient.storage
      .from("academy-documents")
      .upload(uploadedObjectPath, validated.businessRegistrationFile, {
        contentType: validated.businessRegistrationFile.type,
        upsert: false
      })

    if (uploadError) {
      await deleteAcademyUpdateRequest(serviceRoleClient, insertedRequest.id)
      return {
        status: "error",
        message: "사업자등록증 업로드에 실패했습니다. 잠시 후 다시 시도해 주세요."
      }
    }

    const updatedSnapshot = {
      ...requestedSnapshot,
      businessRegistrationFilePath: uploadedObjectPath
    } satisfies AcademyUpdateSnapshot

    const { error: updateError } = await serviceRoleClient
      .from("academy_update_requests")
      .update({
        requested_business_registration_file_path: uploadedObjectPath,
        requested_snapshot: updatedSnapshot
      })
      .eq("id", insertedRequest.id)
      .eq("status", "pending")

    if (updateError) {
      await serviceRoleClient.storage.from("academy-documents").remove([uploadedObjectPath])
      await deleteAcademyUpdateRequest(serviceRoleClient, insertedRequest.id)
      return {
        status: "error",
        message: "요청 정보를 최종 저장하지 못했습니다. 잠시 후 다시 시도해 주세요."
      }
    }
  }

  revalidatePath("/studio/settings")
  revalidatePath("/admin/academy-update-requests")

  return {
    status: "success",
    message: "학원 정보수정 요청이 접수되었습니다. 관리자 검토가 끝나면 반영됩니다."
  }
}
