import Link from "next/link"
import type { CSSProperties } from "react"

import { AuthEntryButton } from "@/features/auth/ui/auth-entry-button"
import { getPublicClassDetail } from "@/features/classes/queries/get-public-class-detail"

type ClassDetailPageProps = {
  params: Promise<{
    id: string
  }>
}

const pageContainerStyle: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "20px 16px 40px"
}

const sectionCardStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14
}

const chipStyle: CSSProperties = {
  display: "inline-flex",
  border: "1px solid #d1d5db",
  borderRadius: 999,
  padding: "4px 10px",
  fontSize: 12,
  color: "#374151"
}

const formatPrice = (price: number) => {
  if (price <= 0) {
    return "무료 체험"
  }

  return `체험비 ${price.toLocaleString("ko-KR")}원`
}

export default async function ClassDetailPage({ params }: ClassDetailPageProps) {
  const resolvedParams = await params
  const { data: classItem, error } = await getPublicClassDetail(resolvedParams.id)

  return (
    <main style={pageContainerStyle}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <AuthEntryButton returnTo={`/classes/${resolvedParams.id}`} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Link href="/classes" style={{ color: "#2563eb", fontSize: 14 }}>
          ← 수업 목록으로
        </Link>
      </div>

      {error ? (
        <section style={{ ...sectionCardStyle, borderColor: "#fecaca" }}>
          <p style={{ margin: "0 0 8px", color: "#991b1b", fontSize: 14 }}>{error}</p>
          <Link href="/classes" style={{ color: "#2563eb", fontSize: 14 }}>
            목록으로 돌아가기
          </Link>
        </section>
      ) : null}

      {!error && !classItem ? (
        <section style={sectionCardStyle}>
          <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>수업 정보를 찾을 수 없어요</h1>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
            링크가 바뀌었거나 공개가 종료된 수업일 수 있습니다.
          </p>
        </section>
      ) : null}

      {!error && classItem ? (
        <>
          <section style={{ ...sectionCardStyle, marginBottom: 10 }}>
            {classItem.coverImageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={classItem.coverImageUrl}
                  alt={`${classItem.title} 대표 이미지`}
                  style={{
                    display: "block",
                    width: "100%",
                    height: 220,
                    objectFit: "cover",
                    borderRadius: 10,
                    marginBottom: 12
                  }}
                />
              </>
            ) : null}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              <span style={chipStyle}>{classItem.subject}</span>
              <span style={chipStyle}>{classItem.region}</span>
              <span style={chipStyle}>{classItem.targetAge}</span>
            </div>

            <h1 style={{ margin: "0 0 10px", fontSize: 22 }}>{classItem.title}</h1>
            <p style={{ margin: "0 0 6px", fontSize: 14, color: "#111827" }}>
              {formatPrice(classItem.trialPrice)}
            </p>
            <p style={{ margin: 0, fontSize: 13, color: "#4b5563" }}>
              {classItem.teacherDisplayName || classItem.teacherName
                ? `담당 선생님 ${classItem.teacherDisplayName ?? classItem.teacherName}`
                : "담당 선생님 정보 준비 중"}
            </p>
          </section>

          <section style={{ ...sectionCardStyle, marginBottom: 10 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>수업 소개</h2>
            <p style={{ margin: 0, lineHeight: 1.6, color: "#374151", fontSize: 14 }}>
              {classItem.description}
            </p>
          </section>

          <section style={{ ...sectionCardStyle, marginBottom: 14 }}>
            <h2 style={{ margin: "0 0 8px", fontSize: 17 }}>선생님 공개 정보</h2>
            {classItem.teacherProfile ? (
              <div style={{ display: "grid", gap: 6 }}>
                <p style={{ margin: 0, fontSize: 15, color: "#111827" }}>
                  {classItem.teacherProfile.teacherName}
                </p>
                <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                  전문 분야:{" "}
                  {classItem.teacherProfile.specialty
                    ? classItem.teacherProfile.specialty
                    : "준비 중"}
                </p>
                <p style={{ margin: 0, fontSize: 14, color: "#374151" }}>
                  경력: {classItem.teacherProfile.careerYears}년
                </p>
                <p style={{ margin: 0, fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
                  {classItem.teacherProfile.intro
                    ? classItem.teacherProfile.intro
                    : "선생님 소개가 곧 추가될 예정입니다."}
                </p>
              </div>
            ) : (
              <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
                현재 공개 가능한 선생님 정보가 없습니다.
              </p>
            )}
          </section>

          <section style={sectionCardStyle}>
            <Link
              href={`/classes/${classItem.id}/apply`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "none",
                backgroundColor: "#111827",
                color: "#ffffff",
                fontSize: 15,
                textDecoration: "none"
              }}
            >
              체험수업 예약하기
            </Link>
          </section>
        </>
      ) : null}
    </main>
  )
}
