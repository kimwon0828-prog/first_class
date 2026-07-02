"use server"

import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { isAcademyArea } from "@/shared/config/academy-areas"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

export type StudioSignUpActionState = {
  status: "idle" | "error" | "success"
  message: string
}

const defaultState: StudioSignUpActionState = {
  status: "idle",
  message: ""
}

const MAX_BUSINESS_REGISTRATION_FILE_SIZE = 5 * 1024 * 1024
const BUSINESS_REGISTRATION_MIME_TO_EXTENSION = {
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

const validateSignUpForm = (formData: FormData) => {
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
  const businessRegistrationFile = formData.get("businessRegistrationFile")
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (organizationName.length < 2 || organizationName.length > 50) {
    return { ok: false as const, message: "학원명은 2자 이상 50자 이하로 입력해 주세요." }
  }

  if (!isAcademyArea(academyArea)) {
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

  const address = [addressLine1, addressLine2].filter(Boolean).join(" ").trim()

  if (!(businessRegistrationFile instanceof File) || businessRegistrationFile.size <= 0) {
    return { ok: false as const, message: "사업자등록증 이미지를 첨부해 주세요." }
  }

  if (businessRegistrationFile.size > MAX_BUSINESS_REGISTRATION_FILE_SIZE) {
    return { ok: false as const, message: "사업자등록증 이미지는 5MB 이하만 업로드할 수 있습니다." }
  }

  if (!isAllowedBusinessRegistrationMime(businessRegistrationFile.type)) {
    return {
      ok: false as const,
      message: "사업자등록증 이미지는 JPG, PNG, WEBP 형식만 업로드할 수 있습니다."
    }
  }

  if (!email || !email.includes("@")) {
    return { ok: false as const, message: "올바른 이메일을 입력해 주세요." }
  }

  if (password.length < 8) {
    return { ok: false as const, message: "비밀번호는 8자 이상이어야 합니다." }
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
    postalCode: postalCode || null,
    addressLine1,
    addressLine2: addressLine2 || null,
    address,
    addressDetail: addressLine2 || null,
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

export async function studioSignUpAction(
  previousState: StudioSignUpActionState = defaultState,
  formData: FormData
): Promise<StudioSignUpActionState> {
  void previousState
  const validated = validateSignUpForm(formData)
  if (!validated.ok) {
    return { status: "error", message: validated.message }
  }

  const supabase = await getSupabaseServerClient()
  let serviceRoleClient: SupabaseClient

  try {
    serviceRoleClient = getSupabaseServiceRoleClient()
  } catch (serviceRoleError) {
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
        role: "teacher",
        name: fallbackTeacherName,
        teacher_name: fallbackTeacherName,
        teacher_phone: validated.contactPhone,
        organization_name: validated.organizationName,
        academy_area: validated.academyArea,
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
        address_line2: validated.addressLine2
      }
    }
  })

  if (error) {
    if (error.message.includes("User already registered")) {
      return { status: "error", message: "이미 가입된 이메일입니다." }
    }
    return {
      status: "error",
      message: "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  if (!data.user) {
    return {
      status: "error",
      message: "계정을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요."
    }
  }

  let uploadedObjectPath: string | null = null

  try {
    const pendingRequest = await findPendingTeacherSignupRequestWithRetry(serviceRoleClient, data.user.id)
    if (!pendingRequest) {
      console.error("[studio sign-up request lookup failed]", {
        userId: data.user.id,
        signupEmail: validated.email
      })
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
      console.error("[studio sign-up upload failed]", {
        userId: data.user.id,
        requestId: pendingRequest.id,
        path: uploadedObjectPath,
        message: uploadError.message
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

      console.error("[studio sign-up request update failed]", {
        userId: data.user.id,
        requestId: pendingRequest.id,
        path: uploadedObjectPath,
        updateError: updateError.message,
        cleanupError: cleanupError?.message ?? null
      })

      return {
        status: "error",
        message: "계정은 생성되었지만 신청 정보 저장에 실패했습니다. 운영팀에 문의해 주세요."
      }
    }
  } catch (postSignUpError) {
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
