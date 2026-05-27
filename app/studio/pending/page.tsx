import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"

export default async function StudioPendingPage() {
  const session = await getSession()
  
  if (!session) {
    redirect("/studio/sign-in")
  }

  const profile = await getMyProfile()
  if (profile?.role === "teacher") {
    redirect("/studio/applications")
  }

  const { dataAdapter } = await import("@/shared/lib/db")
  const pendingRequest = await dataAdapter.getPendingTeacherSignupRequest(session.user.id)
  
  if (!pendingRequest && profile?.role === "parent") {
    redirect("/classes")
  }

  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 24, margin: "0 0 16px" }}>학원 계정 승인 대기 중입니다</h1>
      
      <p style={{ fontSize: 16, color: "#4b5563", lineHeight: "24px", marginBottom: 32 }}>
        학원 계정 신청이 접수되었습니다.<br />
        관리자 확인 및 승인 후 Studio 기능을 이용하실 수 있습니다.
      </p>

      {pendingRequest ? (
        <div style={{ background: "#f3f4f6", padding: 20, borderRadius: 12, textAlign: "left", marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, margin: "0 0 12px" }}>신청 정보</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 14, color: "#374151" }}>
            <li style={{ marginBottom: 8 }}><strong>학원 이름:</strong> {pendingRequest.organizationName}</li>
            <li style={{ marginBottom: 8 }}><strong>학원가:</strong> {pendingRequest.academyArea}</li>
            {pendingRequest.branchName && (
              <li style={{ marginBottom: 8 }}><strong>지점명:</strong> {pendingRequest.branchName}</li>
            )}
            <li><strong>신청 상태:</strong> {pendingRequest.status === "pending" ? "승인 대기" : pendingRequest.status}</li>
          </ul>
        </div>
      ) : null}

      <Link 
        href="/api/auth/sign-out" 
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
    </main>
  )
}
