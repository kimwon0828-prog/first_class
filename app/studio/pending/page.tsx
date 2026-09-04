import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioSignUpForm } from "@/features/studio/ui/studio-sign-up-form"
import { getSupabaseServerClient } from "@/integrations/supabase/server"
import { formatAdministrativeRegionLabel } from "@/features/location/lib/region-selection"

type SignupRequestRow = {
  id: string
  status: string
  organization_name: string
  branch_name: string | null
  representative_name: string | null
  business_registration_number: string | null
  business_registration_file_path: string | null
  academy_phone: string | null
  contact_phone: string | null
  postal_code: string | null
  address_line1: string | null
  address_line2: string | null
  sido: string | null
  sigungu: string | null
  bname: string | null
  sigungu_code: string | null
  bcode: string | null
  rejection_reason: string | null
}

export default async function StudioPendingPage() {
  const session = await getSession()
  
  if (!session) {
    redirect("/studio/sign-in")
  }

  const profile = await getMyProfile()
  if (profile?.role === "academy" || profile?.role === "admin") {
    redirect("/studio/applications")
  }

  const supabase = await getSupabaseServerClient()
  const { data: signupRequest } = await supabase
    .from("teacher_signup_requests")
    .select(
      [
        "id",
        "status",
        "organization_name",
        "branch_name",
        "representative_name",
        "business_registration_number",
        "business_registration_file_path",
        "academy_phone",
        "contact_phone",
        "postal_code",
        "address_line1",
        "address_line2",
        "sido",
        "sigungu",
        "bname",
        "sigungu_code",
        "bcode",
        "rejection_reason"
      ].join(", ")
    )
    .eq("user_id", session.user.id)
    .in("status", ["pending", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  
  if (!signupRequest && profile?.role === "parent") {
    redirect("/classes")
  }

  const request = (signupRequest as SignupRequestRow | null) ?? null
  // 신청자가 입력한 주소를 우선 보여주고, 행정지역 metadata 가 있으면 함께 노출한다.
  // legacy 학원가 값으로 fallback 하지 않는다.
  const requestAddressLabel = request
    ? [request.postal_code ? `(${request.postal_code})` : null, request.address_line1, request.address_line2]
        .filter((value): value is string => Boolean(value && value.trim()))
        .join(" ") || null
    : null
  const requestRegionLabel = request
    ? formatAdministrativeRegionLabel({
        sido: request.sido,
        sigungu: request.sigungu,
        bname: request.bname
      })
    : null
  const isRejected = request?.status === "rejected"
  const rejectionReason = request?.rejection_reason?.trim() || "운영팀에 문의해 주세요."

  return (
    <main
      style={{
        maxWidth: isRejected ? 760 : 480,
        margin: "0 auto",
        padding: "60px 24px",
        textAlign: isRejected ? "left" : "center"
      }}
    >
      <div style={{ marginBottom: 18, display: "flex", justifyContent: isRejected ? "flex-start" : "center" }}>
        <StudioHomeLogo />
      </div>
      {isRejected ? (
        <>
          <h1 style={{ fontSize: 28, margin: "0 0 16px", textAlign: "left" }}>신청이 반려되었습니다</h1>
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 16,
              padding: 20,
              marginBottom: 16
            }}
          >
            <p style={{ margin: "0 0 10px", fontSize: 14, lineHeight: "20px", fontWeight: 800, color: "#b91c1c" }}>
              반려 사유
            </p>
            <p style={{ margin: 0, fontSize: 15, lineHeight: "24px", color: "#7f1d1d", whiteSpace: "pre-wrap" }}>
              {rejectionReason}
            </p>
          </div>
          <p style={{ fontSize: 15, color: "#4b5563", lineHeight: "24px", margin: "0 0 28px" }}>
            아래에서 정보를 수정한 뒤 다시 신청해 주세요.
          </p>
          {request ? (
            <section
              style={{
                background: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 24,
                padding: 24,
                boxShadow: "0 12px 24px rgba(17, 17, 17, 0.04)"
              }}
            >
              <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: "0 0 8px", fontSize: 20, lineHeight: "28px", color: "#111111" }}>
                  정보 수정하고 재신청
                </h2>
                <p style={{ margin: 0, fontSize: 14, lineHeight: "22px", color: "#6b7280" }}>
                  기존 신청 정보를 불러왔습니다. 필요한 항목을 수정한 뒤 다시 제출해 주세요.
                </p>
              </div>
              <StudioSignUpForm
                mode="resubmit"
                initialValues={{
                  organizationName: request.organization_name,
                  branchName: request.branch_name,
                  representativeName: request.representative_name,
                  businessRegistrationNumber: request.business_registration_number,
                  academyPhone: request.academy_phone,
                  contactPhone: request.contact_phone,
                  postalCode: request.postal_code,
                  addressLine1: request.address_line1,
                  addressLine2: request.address_line2,
                  region: {
                    sido: request.sido,
                    sigungu: request.sigungu,
                    bname: request.bname,
                    sigunguCode: request.sigungu_code,
                    bcode: request.bcode
                  },
                  businessRegistrationFilePath: request.business_registration_file_path
                }}
              />
            </section>
          ) : null}

          {/* 반려 상태에서도 로그아웃은 항상 가능해야 한다.
              Studio 사용 권한과 세션 종료 권한을 묶지 않는다. */}
          <div style={{ marginTop: 24 }}>
            <Link
              href="/studio/sign-out"
              prefetch={false}
              style={{
                display: "inline-block",
                padding: "12px 24px",
                background: "#e5e7eb",
                color: "#374151",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 500
              }}
            >
              로그아웃
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 24, margin: "0 0 16px" }}>학원 계정 승인 대기 중입니다</h1>

          <p style={{ fontSize: 16, color: "#4b5563", lineHeight: "24px", marginBottom: 32 }}>
            학원 계정 신청이 접수되었습니다.<br />
            관리자 확인 및 승인 후 Studio 기능을 이용하실 수 있습니다.
          </p>

          {request ? (
            <div style={{ background: "#f3f4f6", padding: 20, borderRadius: 12, textAlign: "left", marginBottom: 32 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>신청 정보</h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 14, color: "#374151" }}>
                <li style={{ marginBottom: 8 }}><strong>학원 이름:</strong> {request.organization_name}</li>
                {request.branch_name ? (
                  <li style={{ marginBottom: 8 }}><strong>지점명:</strong> {request.branch_name}</li>
                ) : null}
                <li style={{ marginBottom: 8 }}>
                  <strong>주소:</strong> {requestAddressLabel ?? "주소 정보 없음"}
                </li>
                {requestRegionLabel ? (
                  <li style={{ marginBottom: 8 }}><strong>지역:</strong> {requestRegionLabel}</li>
                ) : null}
                <li><strong>신청 상태:</strong> 승인 대기</li>
              </ul>
            </div>
          ) : null}

          {/* Studio 로그아웃의 canonical 경로는 /studio/sign-out 이다.
              (studio-mypage-page · studio/access 와 같은 링크를 쓴다)
              여기서만 쓰던 /api/auth/sign-out 은 존재하지 않는 경로라 404 였고,
              세션이 그대로 남아 승인 대기 화면에 갇혔다. */}
          <Link
            href="/studio/sign-out"
            prefetch={false}
            style={{
              display: "inline-block",
              padding: "12px 24px",
              background: "#e5e7eb",
              color: "#374151",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 500
            }}
          >
            로그아웃
          </Link>
        </>
      )}
    </main>
  )
}
