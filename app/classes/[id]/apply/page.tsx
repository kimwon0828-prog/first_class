import Link from "next/link"
import type { CSSProperties } from "react"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getClassAvailableSlots } from "@/features/applications/queries/get-class-available-slots"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"
import { ApplyForm } from "@/features/applications/ui/apply-form"

type ApplyPageProps = {
  params: Promise<{
    id: string
  }>
}

const pageContainerStyle: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "20px 16px 40px"
}

const cardStyle: CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  backgroundColor: "#fff",
  padding: 14
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료 체험"
  }

  return `${price.toLocaleString("ko-KR")}원`
}

export default async function ClassApplyPage({ params }: ApplyPageProps) {
  const resolvedParams = await params
  const returnTo = `/classes/${resolvedParams.id}/apply`
  await requireSession(`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`)
  const profile = await getMyProfile()
  const { data: classItem, error } = await getPublicClassDetail(resolvedParams.id)
  const { data: slots, error: slotsError } = await getClassAvailableSlots(resolvedParams.id)

  return (
    <main style={pageContainerStyle}>
      <div style={{ marginBottom: 12 }}>
        <Link href={`/classes/${resolvedParams.id}`} style={{ color: "#2563eb", fontSize: 14 }}>
          ← 뒤로가기
        </Link>
      </div>

      <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>체험 신청</h1>

      {error ? (
        <section style={{ ...cardStyle, borderColor: "#fecaca" }}>
          <p style={{ margin: "0 0 8px", color: "#991b1b", fontSize: 14 }}>{error}</p>
          <Link href="/classes" style={{ color: "#2563eb", fontSize: 14 }}>
            수업 목록으로 이동
          </Link>
        </section>
      ) : null}

      {!error && !classItem ? (
        <section style={cardStyle}>
          <p style={{ margin: 0, fontSize: 14, color: "#4b5563" }}>
            신청할 수업 정보를 찾을 수 없습니다.
          </p>
        </section>
      ) : null}

      {!error && classItem ? (
        <div style={{ display: "grid", gap: 12 }}>
          {!profile || profile.role !== "parent" ? (
            <section style={{ ...cardStyle, borderColor: "#fecaca" }}>
              <p style={{ margin: "0 0 8px", color: "#991b1b", fontSize: 14 }}>
                학부모(parent) 계정만 체험수업 예약이 가능합니다.
              </p>
              <Link href={`/classes/${resolvedParams.id}`} style={{ color: "#2563eb", fontSize: 14 }}>
                수업 상세로 돌아가기
              </Link>
            </section>
          ) : null}

          <section style={cardStyle}>
            <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>수업 요약</h2>
            <div style={{ display: "grid", gap: 4, fontSize: 14, color: "#374151" }}>
              <p style={{ margin: 0 }}>수업명: {classItem.title}</p>
              <p style={{ margin: 0 }}>과목: {classItem.subject}</p>
              <p style={{ margin: 0 }}>지역: {classItem.region}</p>
              <p style={{ margin: 0 }}>
                선생님명:{" "}
                {classItem.teacherDisplayName ?? classItem.teacherName ?? "정보 준비 중"}
              </p>
              <p style={{ margin: 0 }}>체험비: {formatPrice(classItem.trialPrice)}</p>
            </div>
          </section>

          {profile?.role === "parent" ? (
            <section style={cardStyle}>
              <ApplyForm classId={classItem.id} availableSlots={slots} slotsError={slotsError} />
            </section>
          ) : null}
        </div>
      ) : null}
    </main>
  )
}
