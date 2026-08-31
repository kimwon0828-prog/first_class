"use server"

import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import {
  buildOrganizationAddressWritePayload,
  buildSignupRequestRegionWritePayload
} from "@/features/organizations/lib/organization-address-contract"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type StudioSignUpActionState = {
  status: "idle" | "error" | "success"
  message: string
  actionLinkHref?: string
  actionLinkLabel?: string
}

const defaultState: StudioSignUpActionState = {
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

const isAllowedBusinessRegistrationMime = (
  value: string
): value is keyof typeof BUSINESS_REGISTRATION_MIME_TO_EXTENSION =>
  value in BUSINESS_REGISTRATION_MIME_TO_EXTENSION

const phonePattern = /^[0-9+\-()\s]+$/
const businessRegistrationNumberPattern = /^[0-9-\s]+$/
const postalCodePattern = /^[0-9A-Za-z-\s]+$/

const wait = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const logValidationFailure = (
  field: string,
  reason: string,
  details?: Record<string, unknown>
) => {
  console.error("[studio sign-up] validation failed", {
    field,
    reason,
    ...(details ?? {})
  })
}

const validatePhone = (value: string, label: string) => {
  if (value.length < 7 || value.length > 20 || !phonePattern.test(value)) {
    return `${label}를 올바르게 입력해 주세요.`
  }

  return null
}

type PendingTeacherSignupRequestRow = {
  id: string
  user_id: string
}

type ExistingTeacherSignupRequestRow = {
  id: string
}

const validateSignUpForm = (formData: FormData) => {
  const organizationName = String(formData.get("organizationName") ?? "").trim()
  const branchName = String(formData.get("branchName") ?? "").trim()
  const representativeName = String(formData.get("representativeName") ?? "").trim()
  const businessRegistrationNumber = String(formData.get("businessRegistrationNumber") ?? "").trim()
  const academyPhone = String(formData.get("academyPhone") ?? "").trim()
  const contactPhone = String(formData.get("contactPhone") ?? "").trim()
  const postalCode = String(formData.get("postalCode") ?? "").trim()
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim()
  const addressLine2 = String(formData.get("addressLine2") ?? "").trim()
  const businessRegistrationFile = formData.get("businessRegistrationFile")
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (organizationName.length < 2 || organizationName.length > 50) {
    logValidationFailure("organizationName", "length_out_of_range", {
      length: organizationName.length
    })
    return { ok: false as const, message: "학원명은 2자 이상 50자 이하로 입력해 주세요." }
  }

  if (branchName.length > 30) {
    logValidationFailure("branchName", "length_exceeded", {
      length: branchName.length
    })
    return { ok: false as const, message: "지점명은 30자 이하로 입력해 주세요." }
  }

  if (representativeName.length < 2 || representativeName.length > 40) {
    logValidationFailure("representativeName", "length_out_of_range", {
      length: representativeName.length
    })
    return { ok: false as const, message: "대표자명은 2자 이상 40자 이하로 입력해 주세요." }
  }

  if (
    businessRegistrationNumber.length < 10 ||
    businessRegistrationNumber.length > 20 ||
    !businessRegistrationNumberPattern.test(businessRegistrationNumber)
  ) {
    logValidationFailure("businessRegistrationNumber", "invalid_format_or_length", {
      length: businessRegistrationNumber.length
    })
    return { ok: false as const, message: "사업자등록번호를 올바르게 입력해 주세요." }
  }

  const academyPhoneError = validatePhone(academyPhone, "학원 대표 전화번호")
  if (academyPhoneError) {
    logValidationFailure("academyPhone", "invalid_phone", {
      length: academyPhone.length
    })
    return { ok: false as const, message: academyPhoneError }
  }

  const contactPhoneError = validatePhone(contactPhone, "담당자 전화번호")
  if (contactPhoneError) {
    logValidationFailure("contactPhone", "invalid_phone", {
      length: contactPhone.length
    })
    return { ok: false as const, message: contactPhoneError }
  }

  if (postalCode && (postalCode.length > 20 || !postalCodePattern.test(postalCode))) {
    logValidationFailure("postalCode", "invalid_format_or_length", {
      length: postalCode.length
    })
    return { ok: false as const, message: "우편번호를 올바르게 입력해 주세요." }
  }

  if (!addressLine1 || addressLine1.length > 120) {
    logValidationFailure("addressLine1", "missing_or_length_exceeded", {
      length: addressLine1.length
    })
    return { ok: false as const, message: "기본 주소를 입력해 주세요." }
  }

  if (addressLine2.length > 120) {
    logValidationFailure("addressLine2", "length_exceeded", {
      length: addressLine2.length
    })
    return { ok: false as const, message: "상세 주소는 120자 이하로 입력해 주세요." }
  }

  const addressPayload = buildOrganizationAddressWritePayload({
    postalCode,
    addressLine1,
    addressLine2
  })

  // Kakao 가 지역에 따라 일부 필드를 빈 문자열로 주므로 NULL 로 저장하고,
  // metadata 누락만으로 가입을 실패시키지 않는다.
  const regionPayload = buildSignupRequestRegionWritePayload({
    sido: String(formData.get("sido") ?? ""),
    sigungu: String(formData.get("sigungu") ?? ""),
    bname: String(formData.get("bname") ?? ""),
    sigunguCode: String(formData.get("sigunguCode") ?? ""),
    bcode: String(formData.get("bcode") ?? "")
  })

  if (!(businessRegistrationFile instanceof File) || businessRegistrationFile.size <= 0) {
    logValidationFailure("businessRegistrationFile", "missing_file")
    return { ok: false as const, message: "사업자등록증 파일을 첨부해 주세요." }
  }

  if (businessRegistrationFile.size > MAX_BUSINESS_REGISTRATION_FILE_SIZE) {
    logValidationFailure("businessRegistrationFile", "file_size_exceeded", {
      size: businessRegistrationFile.size
    })
    return { ok: false as const, message: "사업자등록증 파일은 5MB 이하만 업로드할 수 있습니다." }
  }

  if (!isAllowedBusinessRegistrationMime(businessRegistrationFile.type)) {
    logValidationFailure("businessRegistrationFile", "invalid_mime_type", {
      type: businessRegistrationFile.type
    })
    return {
      ok: false as const,
      message: "사업자등록증 파일은 PDF, JPG, PNG, WEBP 형식만 업로드할 수 있습니다."
    }
  }

  if (!email || !email.includes("@")) {
    logValidationFailure("email", "invalid_email", {
      email
    })
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (password.length < 8) {
    logValidationFailure("password", "length_too_short", {
      length: password.length
    })
    return { ok: false as const, message: "비밀번호는 8자 이상이어야 합니다." }
  }

  return {
    ok: true as const,
    organizationName,
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
    businessRegistrationFile,
    email,
    password
  }
}

const findPendingTeacherSignupRequestWithRetry = async (
  supabase: SupabaseClient,
  userId: string
): Promise<PendingTeacherSignupRequestRow | null> => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await supabase
      .from("teacher_signup_requests")
      .select("id, user_id")
      .eq("user_id", userId)
      .eq("status", "pending")
      .maybeSingle()

    if (error) {
      throw new Error(`failed_to_find_pending_signup_request:${error.message}`)
    }

    if (data) {
      return data as PendingTeacherSignupRequestRow
    }

    if (attempt < 4) {
      await wait(250)
    }
  }

  return null
}

const findAnyTeacherSignupRequest = async (
  supabase: SupabaseClient,
  userId: string
): Promise<ExistingTeacherSignupRequestRow | null> => {
  const { data, error } = await supabase
    .from("teacher_signup_requests")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`failed_to_find_existing_signup_request:${error.message}`)
  }

  return (data as ExistingTeacherSignupRequestRow | null) ?? null
}

export async function studioSignUpAction(
  previousState: StudioSignUpActionState = defaultState,
  formData: FormData
): Promise<StudioSignUpActionState> {
  void previousState
  const validated = validateSignUpForm(formData)
  if (!validated.ok) {
    console.error("[studio sign-up] validateSignUpForm failed", {
      message: validated.message
    })
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  let serviceRoleClient: SupabaseClient

  try {
    serviceRoleClient = getSupabaseServiceRoleClient()
  } catch (serviceRoleError) {
    console.error("[studio sign-up] getSupabaseServiceRoleClient failed", serviceRoleError)
    return {
      status: "error",
      message:
        serviceRoleError instanceof Error
          ? serviceRoleError.message
          : "서버 설정이 완료되지 않아 가입 신청을 진행할 수 없습니다."
    }
  }

  const fallbackTeacherName = `${validated.organizationName} 관리자`
  
  // teacher_signup_requests is created by DB trigger on auth.users.
  const { data, error } = await supabase.auth.signUp({
    email: validated.email,
    password: validated.password,
    options: {
      data: {
        signup_intent: "teacher_public",
        name: fallbackTeacherName,
        teacher_name: fallbackTeacherName,
        teacher_phone: validated.contactPhone,
        organization_name: validated.organizationName,
        branch_name: validated.branchName,
        address: validated.address,
        address_detail: validated.addressDetail,
        organization_phone: validated.academyPhone,
        request_note: null,
        representative_name: validated.representativeName,
        business_registration_number: validated.businessRegistrationNumber,
        academy_phone: validated.academyPhone,
        contact_phone: validated.contactPhone,
        postal_code: validated.postalCode,
        address_line1: validated.addressLine1,
        address_line2: validated.addressLine2,
        ...validated.regionPayload
      }
    }
  })

  if (error) {
    console.error("[studio sign-up] auth.signUp failed", error)
    if (error.message.includes("User already registered")) {
      return { status: "error", message: "이미 가입된 이메일입니다." }
    }
    return {
      status: "error",
      message: "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (!data.user) {
    console.error("[studio sign-up] auth.signUp returned without user", {
      signupEmail: validated.email
    })
    return {
      status: "error",
      message: "계정을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  let uploadedObjectPath: string | null = null

  try {
    const pendingRequest = await findPendingTeacherSignupRequestWithRetry(serviceRoleClient, data.user.id)
    if (!pendingRequest) {
      const existingRequest = await findAnyTeacherSignupRequest(serviceRoleClient, data.user.id)
      console.log("[studio sign-up] fallback lookup", {
        userId: data.user.id,
        found: Boolean(existingRequest)
      })
      console.error("[studio sign-up request lookup failed]", {
        userId: data.user.id,
        signupEmail: validated.email,
        hasExistingRequest: Boolean(existingRequest)
      })

      if (existingRequest) {
        return {
          status: "error",
          message: "이미 신청 내역이 있는 계정입니다. 운영보드 로그인 후 진행해 주세요.",
          actionLinkHref: "/studio/sign-in",
          actionLinkLabel: "운영보드 로그인"
        }
      }

      return {
        status: "error",
        message: "계정은 생성되었지만 신청 정보를 연결하지 못했습니다. 운영팀에 문의해 주세요."
      }
    }

    const businessRegistrationMime =
      validated.businessRegistrationFile.type as keyof typeof BUSINESS_REGISTRATION_MIME_TO_EXTENSION
    const fileExtension = BUSINESS_REGISTRATION_MIME_TO_EXTENSION[businessRegistrationMime]
    uploadedObjectPath = [
      "teacher-signup-requests",
      pendingRequest.id,
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
      console.error("[studio sign-up] storage upload failed", uploadError, {
        userId: data.user.id,
        requestId: pendingRequest.id,
        path: uploadedObjectPath
      })
      return {
        status: "error",
        message: "계정은 생성되었지만 사업자등록증 저장에 실패했습니다. 운영팀에 문의해 주세요."
      }
    }

    const { error: updateError } = await serviceRoleClient
      .from("teacher_signup_requests")
      .update({
        representative_name: validated.representativeName,
        business_registration_number: validated.businessRegistrationNumber,
        business_registration_file_path: uploadedObjectPath,
        academy_phone: validated.academyPhone,
        contact_phone: validated.contactPhone,
        postal_code: validated.postalCode,
        address_line1: validated.addressLine1,
        address_line2: validated.addressLine2,
        address: validated.address,
        address_detail: validated.addressDetail,
        ...validated.regionPayload,
        teacher_phone: validated.contactPhone,
        organization_phone: validated.academyPhone
      })
      .eq("id", pendingRequest.id)
      .eq("user_id", data.user.id)
      .eq("status", "pending")

    if (updateError) {
      const { error: cleanupError } = await serviceRoleClient.storage
        .from("academy-documents")
        .remove([uploadedObjectPath])

      console.error("[studio sign-up] request update failed", updateError, {
        userId: data.user.id,
        requestId: pendingRequest.id,
        path: uploadedObjectPath,
        cleanupError: cleanupError?.message ?? null
      })

      return {
        status: "error",
        message: "계정은 생성되었지만 신청 정보 저장에 실패했습니다. 운영팀에 문의해 주세요."
      }
    }
  } catch (postSignUpError) {
    console.error("[studio sign-up] unexpected error", postSignUpError)
    console.error("[studio sign-up post-processing failed]", {
      userId: data.user.id,
      signupEmail: validated.email,
      uploadedObjectPath,
      message: postSignUpError instanceof Error ? postSignUpError.message : "unknown_error"
    })

    return {
      status: "error",
      message: "계정은 생성되었지만 신청 처리 중 후속 작업에 실패했습니다. 운영팀에 문의해 주세요."
    }
  }

  return {
    status: "success",
    message: "학원 계정 신청이 완료되었습니다. 관리자 승인 후 운영보드에 로그인할 수 있습니다."
  }
}
