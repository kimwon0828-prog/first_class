import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { AcademyApprovalsClient } from "./academy-approvals-client"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

type SignupRequestRow = {
  id: string
  user_id: string
  signup_email: string | null
  organization_name: string
  academy_area: string
  branch_name: string | null
  address: string | null
  address_detail: string | null
  teacher_name: string
  teacher_phone: string | null
  organization_phone: string | null
  status: string
  created_at: string
  representative_name: string | null
  business_registration_number: string | null
  business_registration_file_path: string | null
  academy_phone: string | null
  contact_phone: string | null
  postal_code: string | null
  address_line1: string | null
  address_line2: string | null
  admin_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  approved_organization_id: string | null
  approved_teacher_id: string | null
}

type SignupRequestView = {
  requestId: string
  signupEmail: string | null
  organizationName: string
  academyArea: string
  branchName: string | null
  address: string | null
  addressDetail: string | null
  teacherName: string
  teacherPhone: string | null
  organizationPhone: string | null
  status: string
  createdAt: string
  representativeName: string | null
  businessRegistrationNumber: string | null
  businessRegistrationFilePath: string | null
  academyPhone: string | null
  contactPhone: string | null
  postalCode: string | null
  addressLine1: string | null
  addressLine2: string | null
  adminNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  businessRegistrationSignedUrl: string | null
  businessRegistrationSignedUrlError: string | null
}

type ReviewedSignupRequestRow = {
  id: string
  reviewed_at: string | null
}

type ApprovedSignupRequestRow = {
  id: string
  status: string
  approved_organization_id: string | null
  approved_teacher_id: string | null
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
  organization_phone: string | null
  teacher_phone: string | null
}

const requireAdmin = async () => {
  await requireSession("/auth/sign-in?returnTo=/admin/academy-approvals")
  const profile = await getMyProfile()

  if (!profile) {
    redirect("/classes")
  }

  if (profile.dbRole !== "admin") {
    redirect(profile.role === "parent" ? "/classes" : "/studio")
  }

  return profile
}

const BUSINESS_REGISTRATION_SIGNED_URL_TTL_SECONDS = 60 * 5

const getSignupRequests = async (): Promise<SignupRequestView[]> => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("teacher_signup_requests")
    .select(
      [
        "id",
        "user_id",
        "signup_email",
        "organization_name",
        "academy_area",
        "branch_name",
        "address",
        "address_detail",
        "teacher_name",
        "teacher_phone",
        "organization_phone",
        "status",
        "created_at",
        "representative_name",
        "business_registration_number",
        "business_registration_file_path",
        "academy_phone",
        "contact_phone",
        "postal_code",
        "address_line1",
        "address_line2",
        "admin_note",
        "reviewed_by",
        "reviewed_at",
        "approved_organization_id",
        "approved_teacher_id"
      ].join(", ")
    )
    .order("created_at", { ascending: false })

  if (error) {
    throw error
  }

  const rows = (data ?? []) as unknown as SignupRequestRow[]

  return Promise.all(
    rows.map(async (row) => {
      let businessRegistrationSignedUrl: string | null = null
      let businessRegistrationSignedUrlError: string | null = null
      const filePath = row.business_registration_file_path?.trim() ?? null

      if (filePath) {
        const { data: signedUrlData, error: signedUrlError } = await serviceRoleClient.storage
          .from("academy-documents")
          .createSignedUrl(filePath, BUSINESS_REGISTRATION_SIGNED_URL_TTL_SECONDS)

        if (signedUrlError) {
          businessRegistrationSignedUrlError = signedUrlError.message
        } else {
          businessRegistrationSignedUrl = signedUrlData.signedUrl
        }
      }

      return {
        requestId: row.id,
        signupEmail: row.signup_email,
        organizationName: row.organization_name,
        academyArea: row.academy_area,
        branchName: row.branch_name,
        address: row.address,
        addressDetail: row.address_detail,
        teacherName: row.teacher_name,
        teacherPhone: row.teacher_phone,
        organizationPhone: row.organization_phone,
        status: row.status,
        createdAt: row.created_at,
        representativeName: row.representative_name,
        businessRegistrationNumber: row.business_registration_number,
        businessRegistrationFilePath: filePath,
        academyPhone: row.academy_phone,
        contactPhone: row.contact_phone,
        postalCode: row.postal_code,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        adminNote: row.admin_note,
        reviewedBy: row.reviewed_by,
        reviewedAt: row.reviewed_at,
        businessRegistrationSignedUrl,
        businessRegistrationSignedUrlError
      }
    })
  )
}

const syncRequestReviewMetadata = async (requestId: string, reviewedBy: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("teacher_signup_requests")
    .select("id, reviewed_at")
    .eq("id", requestId)
    .maybeSingle()

  if (error || !data) {
    throw new Error("failed_to_fetch_reviewed_teacher_signup_request")
  }

  const reviewedRequest = data as unknown as ReviewedSignupRequestRow

  const updatePayload: {
    reviewed_by: string
    reviewed_at?: string
  } = {
    reviewed_by: reviewedBy
  }

  if (!reviewedRequest.reviewed_at) {
    updatePayload.reviewed_at = new Date().toISOString()
  }

  const { error: updateError } = await serviceRoleClient
    .from("teacher_signup_requests")
    .update(updatePayload)
    .eq("id", requestId)

  if (updateError) {
    throw new Error(`failed_to_update_teacher_signup_review_metadata:${updateError.message}`)
  }
}

const syncApprovedOrganizationFields = async (requestId: string) => {
  const serviceRoleClient = getSupabaseServiceRoleClient()
  const { data, error } = await serviceRoleClient
    .from("teacher_signup_requests")
    .select(
      [
        "id",
        "status",
        "approved_organization_id",
        "approved_teacher_id",
        "representative_name",
        "business_registration_number",
        "business_registration_file_path",
        "academy_phone",
        "contact_phone",
        "postal_code",
        "address_line1",
        "address_line2",
        "address",
        "address_detail",
        "organization_phone",
        "teacher_phone"
      ].join(", ")
    )
    .eq("id", requestId)
    .maybeSingle()

  if (error || !data) {
    throw new Error("failed_to_fetch_approved_teacher_signup_request")
  }

  const approvedRequest = data as unknown as ApprovedSignupRequestRow

  if (approvedRequest.status !== "approved") {
    throw new Error("teacher_signup_request_not_approved")
  }

  if (!approvedRequest.approved_organization_id) {
    throw new Error("missing_approved_organization_id")
  }

  const { error: organizationUpdateError } = await serviceRoleClient
    .from("organizations")
    .update({
      representative_name: approvedRequest.representative_name,
      business_registration_number: approvedRequest.business_registration_number,
      business_registration_file_path: approvedRequest.business_registration_file_path,
      academy_phone: approvedRequest.academy_phone,
      contact_phone: approvedRequest.contact_phone,
      postal_code: approvedRequest.postal_code,
      address_line1: approvedRequest.address_line1,
      address_line2: approvedRequest.address_line2,
      address: approvedRequest.address,
      address_detail: approvedRequest.address_detail
    })
    .eq("id", approvedRequest.approved_organization_id)

  if (organizationUpdateError) {
    throw new Error(`failed_to_update_organization_with_signup_request:${organizationUpdateError.message}`)
  }

  if (approvedRequest.approved_teacher_id) {
    const { error: teacherUpdateError } = await serviceRoleClient
      .from("teachers")
      .update({
        phone: approvedRequest.teacher_phone ?? approvedRequest.contact_phone ?? null,
        updated_at: new Date().toISOString()
      })
      .eq("id", approvedRequest.approved_teacher_id)

    if (teacherUpdateError) {
      throw new Error(`failed_to_update_teacher_phone_from_signup_request:${teacherUpdateError.message}`)
    }
  }
}

export default async function AdminAcademyApprovalsPage({
  searchParams
}: {
  searchParams?: Promise<{
    error?: string
  }>
}) {
  await requireAdmin()
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const actionError = resolvedSearchParams?.error
  let requests: SignupRequestView[] = []
  let listError: string | null = null

  try {
    requests = await getSignupRequests()
  } catch (error) {
    listError = error instanceof Error ? error.message : "unknown_error"
  }

  const approve = async (formData: FormData) => {
    "use server"
    const admin = await requireAdmin()
    const requestId = String(formData.get("requestId") ?? "")
    if (!requestId) return

    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.rpc("approve_teacher_signup_request", { request_id: requestId })
    if (error) {
      redirect(`/admin/academy-approvals?error=${encodeURIComponent(error.message)}`)
    }

    try {
      await syncApprovedOrganizationFields(requestId)
      await syncRequestReviewMetadata(requestId, admin.id)
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "failed_to_sync_approved_teacher_signup_request"
      redirect(`/admin/academy-approvals?error=${encodeURIComponent(message)}`)
    }

    revalidatePath("/admin/academy-approvals")
  }

  const reject = async (formData: FormData) => {
    "use server"
    const admin = await requireAdmin()
    const requestId = String(formData.get("requestId") ?? "")
    if (!requestId) return

    const supabase = await getSupabaseServerClient()
    const { error } = await supabase.rpc("reject_teacher_signup_request", { request_id: requestId })
    if (error) {
      redirect(`/admin/academy-approvals?error=${encodeURIComponent(error.message)}`)
    }

    try {
      await syncRequestReviewMetadata(requestId, admin.id)
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "failed_to_sync_rejected_teacher_signup_request"
      redirect(`/admin/academy-approvals?error=${encodeURIComponent(message)}`)
    }

    revalidatePath("/admin/academy-approvals")
  }

  return (
    <AcademyApprovalsClient
      requests={requests}
      actionError={actionError ?? null}
      listError={listError}
      approveAction={approve}
      rejectAction={reject}
    />
  )
}
