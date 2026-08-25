"use server"

import { redirect } from "next/navigation"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import {
  buildOrganizationAddressWritePayload,
  buildSignupRequestRegionWritePayload
} from "@/features/organizations/lib/organization-address-contract"
import { isAcademyAreaEnabled } from "@/shared/config/academy-areas"

export type StudioResubmitSignUpActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: StudioResubmitSignUpActionState = {
  status: "idle",
  message: ""
}

const MAX_BUSINESS_REGISTRATION_FILE_SIZE = 5 * 1024 * 1024
const BUSINESS_REGISTRATION_MIME_TO_EXTENSION = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
} as const

const phonePattern = /^[0-9+\-()\s]+$/
const businessRegistrationNumberPattern = /^[0-9-\s]+$/
const postalCodePattern = /^[0-9A-Za-z-\s]+$/

const validatePhone = (value: string, label: string) => {
  if (value.length < 7 || value.length > 20 || !phonePattern.test(value)) {
    return `${label}를 올바르게 입력해 주세요.`
  }

  return null
}

const isAllowedBusinessRegistrationMime = (
  value: string
): value is keyof typeof BUSINESS_REGISTRATION_MIME_TO_EXTENSION =>
  value in BUSINESS_REGISTRATION_MIME_TO_EXTENSION

const validateResubmitForm = (formData: FormData) => {
  const organizationName = String(formData.get("organizationName") ?? "").trim()
  const academyArea = String(formData.get("academyArea") ?? "").trim()
  const branchName = String(formData.get("branchName") ?? "").trim()
  const representativeName = String(formData.get("representativeName") ?? "").trim()
  const businessRegistrationNumber = String(formData.get("businessRegistrationNumber") ?? "").trim()
  const academyPhone = String(formData.get("academyPhone") ?? "").trim()
  const contactPhone = String(formData.get("contactPhone") ?? "").trim()
  const postalCode = String(formData.get("postalCode") ?? "").trim()
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim()
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim()
  const keepExistingBusinessRegistrationFile =
    String(formData.get("keepExistingBusinessRegistrationFile") ?? "no") === "yes"
  const businessRegistrationFile = formData.get("businessRegistrationFile")

  if (organizationName.length < 2 || organizationName.length > 50) {
    return { ok: false as const, message: "학원명은 2자 이상 50자 이하로 입력해 주세요." }
  }

  if (!isAcademyAreaEnabled(academyArea)) {
    return { ok: false as const, message: "학원가를 선택해 주세요." }
  }

  if (branchName.length > 30) {
    return { ok: false as const, message: "지점명은 30자 이하로 입력해 주세요." }
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

  const addressPayload = buildOrganizationAddressWritePayload({
    postalCode,
    addressLine1,
    addressLine2
  })

  // signup 과 동일한 write contract 를 사용한다.
  const regionPayload = buildSignupRequestRegionWritePayload({
    sido: String(formData.get("sido") ?? ""),
    sigungu: String(formData.get("sigungu") ?? ""),
    bname: String(formData.get("bname") ?? ""),
    sigunguCode: String(formData.get("sigunguCode") ?? ""),
    bcode: String(formData.get("bcode") ?? "")
  })

  if (businessRegistrationFile instanceof File && businessRegistrationFile.size > 0) {
    if (businessRegistrationFile.size > MAX_BUSINESS_REGISTRATION_FILE_SIZE) {
      return { ok: false as const, message: "사업자등록증 파일은 5MB 이하만 업로드할 수 있습니다." }
    }

    if (!isAllowedBusinessRegistrationMime(businessRegistrationFile.type)) {
      return {
        ok: false as const,
        message: "사업자등록증 파일은 PDF, JPG, PNG, WEBP 형식만 업로드할 수 있습니다."
      }
    }
  }

  return {
    ok: true as const,
    organizationName,
    academyArea,
    branchName: branchName || null,
    representativeName,
    businessRegistrationNumber,
    academyPhone,
    contactPhone,
    postalCode: addressPayload.postal_code,
    addressLine1: addressPayload.address_line1 ?? addressLine1,
    addressLine2: addressPayload.address_line2,
    address: addressPayload.address,
    addressDetail: addressPayload.address_detail,
    regionPayload,
    keepExistingBusinessRegistrationFile,
    businessRegistrationFile:
      businessRegistrationFile instanceof File && businessRegistrationFile.size > 0
        ? businessRegistrationFile
        : null
  }
}

export async function studioResubmitSignUpAction(
  previousState: StudioResubmitSignUpActionState = defaultState,
  formData: FormData
): Promise<StudioResubmitSignUpActionState> {
  void previousState

  const validated = validateResubmitForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return { status: "error", message: "로그인 상태를 확인한 뒤 다시 시도해 주세요." }
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data: rejectedRequest, error: rejectedRequestError } = await serviceRoleClient
    .from("teacher_signup_requests")
    .select("id, business_registration_file_path")
    .eq("user_id", user.id)
    .eq("status", "rejected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rejectedRequestError) {
    return { status: "error", message: "기존 신청 정보를 확인하지 못했습니다. 다시 시도해 주세요." }
  }

  if (!rejectedRequest) {
    return { status: "error", message: "반려된 신청 내역을 찾지 못했습니다." }
  }

  let nextBusinessRegistrationFilePath = rejectedRequest.business_registration_file_path ?? null

  if (validated.businessRegistrationFile) {
    const fileExtension =
      BUSINESS_REGISTRATION_MIME_TO_EXTENSION[
        validated.businessRegistrationFile.type as keyof typeof BUSINESS_REGISTRATION_MIME_TO_EXTENSION
      ]
    const uploadedObjectPath = [
      "teacher-signup-requests",
      rejectedRequest.id,
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
      return { status: "error", message: "사업자등록증 파일 저장에 실패했습니다. 다시 시도해 주세요." }
    }

    nextBusinessRegistrationFilePath = uploadedObjectPath
  } else if (!validated.keepExistingBusinessRegistrationFile) {
    return { status: "error", message: "사업자등록증 파일을 다시 업로드해 주세요." }
  }

  const { error: updateError } = await serviceRoleClient
    .from("teacher_signup_requests")
    .update({
      status: "pending",
      organization_name: validated.organizationName,
      academy_area: validated.academyArea,
      branch_name: validated.branchName,
      representative_name: validated.representativeName,
      business_registration_number: validated.businessRegistrationNumber,
      business_registration_file_path: nextBusinessRegistrationFilePath,
      academy_phone: validated.academyPhone,
      contact_phone: validated.contactPhone,
      teacher_phone: validated.contactPhone,
      organization_phone: validated.academyPhone,
      postal_code: validated.postalCode,
      address_line1: validated.addressLine1,
      address_line2: validated.addressLine2,
      address: validated.address,
      address_detail: validated.addressDetail,
      ...validated.regionPayload,
      updated_at: new Date().toISOString()
    })
    .eq("id", rejectedRequest.id)
    .eq("user_id", user.id)
    .eq("status", "rejected")

  if (updateError) {
    return { status: "error", message: "재신청 정보를 저장하지 못했습니다. 다시 시도해 주세요." }
  }

  redirect("/studio/pending")
}
