import { NextResponse } from "next/server"

import {
  PARTNER_INQUIRY_HONEYPOT_FIELD,
  getPartnerInquiryDuplicateSinceIso,
  validatePartnerInquiryPayload
} from "@/features/partner/lib/partner-inquiry"
import { sendPartnerInquiryEmail } from "@/features/partner/lib/partner-inquiry-email"
import { getSupabaseServiceRoleClient } from "@/integrations/supabase/service-role"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type PartnerInquiryRequestBody = {
  academyName?: unknown
  phone?: unknown
  privacyAgreed?: unknown
  website?: unknown
}

type PartnerInquiryInsertRow = {
  id: string
  academy_name: string
  phone: string
  privacy_agreed: boolean
  status: string
  created_at: string
}

const successMessage = {
  status: "success" as const,
  message: "문의가 접수되었습니다. 확인 후 빠르게 연락드리겠습니다."
}

const errorResponse = (message: string, status = 400) =>
  NextResponse.json(
    {
      status: "error" as const,
      message
    },
    { status }
  )

export async function POST(request: Request) {
  let body: PartnerInquiryRequestBody

  try {
    body = ((await request.json()) as PartnerInquiryRequestBody) ?? {}
  } catch {
    return errorResponse("문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.")
  }

  const validated = validatePartnerInquiryPayload({
    academyName: typeof body.academyName === "string" ? body.academyName : "",
    phone: typeof body.phone === "string" ? body.phone : "",
    privacyAgreed: body.privacyAgreed === true,
    honeypot: typeof body[PARTNER_INQUIRY_HONEYPOT_FIELD] === "string" ? body.website : ""
  })

  if (!validated.ok) {
    return errorResponse(validated.message)
  }

  const serviceRoleClient = getSupabaseServiceRoleClient()
  const duplicateSince = getPartnerInquiryDuplicateSinceIso()

  const { data: duplicateRow, error: duplicateError } = await serviceRoleClient
    .from("partner_inquiries")
    .select("id")
    .eq("academy_name", validated.value.academyName)
    .eq("phone", validated.value.phone)
    .gte("created_at", duplicateSince)
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (duplicateError) {
    console.error("[partner-inquiry] duplicate check failed", {
      message: duplicateError.message
    })
    return errorResponse("문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", 500)
  }

  if (duplicateRow) {
    return NextResponse.json(successMessage)
  }

  const { data: insertedRow, error: insertError } = await serviceRoleClient
    .from("partner_inquiries")
    .insert({
      academy_name: validated.value.academyName,
      phone: validated.value.phone,
      privacy_agreed: true,
      status: "new"
    })
    .select("id, academy_name, phone, privacy_agreed, status, created_at")
    .single<PartnerInquiryInsertRow>()

  if (insertError || !insertedRow) {
    console.error("[partner-inquiry] insert failed", {
      message: insertError?.message ?? "unknown_error"
    })
    return errorResponse("문의 접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.", 500)
  }

  try {
    await sendPartnerInquiryEmail({
      academyName: insertedRow.academy_name,
      phone: insertedRow.phone,
      createdAt: insertedRow.created_at,
      status: "신규 문의"
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error"
    console.error("[partner-inquiry] email send failed", {
      inquiryId: insertedRow.id,
      message
    })
  }

  return NextResponse.json(successMessage)
}
