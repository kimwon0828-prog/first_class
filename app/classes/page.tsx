import Link from "next/link"
import type { CSSProperties } from "react"

import { AuthEntryButton } from "@/features/auth/ui/auth-entry-button"
import { getPublicClasses } from "@/features/classes/queries/get-public-classes"

const pageContainerStyle: CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "20px 16px 32px"
}

const sectionCardStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14
}

const mutedTextStyle: CSSProperties = {
  margin: 0,
  color: "#6b7280",
  fontSize: 14
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
    return "무료"
  }

  return `신청비 ${price.toLocaleString("ko-KR")}원`
}

const formatProgramType = (value: string) => {
  if (value === "level_test") {
    return "레벨테스트"
  }

  return "체험수업"
}

export default async function ClassesPage() {
  const { data: classes, error } = await getPublicClasses()

  return (
    <main style={pageContainerStyle}>
      <section style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <AuthEntryButton returnTo="/classes" />
        </div>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>프로그램 찾기</h1>
        <p style={mutedTextStyle}>
          로그인 없이 프로그램 정보를 확인하고, 마음에 드는 프로그램을 골라보세요.
        </p>
      </section>

      <section style={{ ...sectionCardStyle, marginBottom: 14 }}>
        <p style={{ ...mutedTextStyle, marginBottom: 10, fontSize: 13 }}>
          검색/필터(준비 중)
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          <input
            disabled
            placeholder="과목, 지역으로 검색 (곧 제공)"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              backgroundColor: "#f9fafb"
            }}
          />
          <button
            type="button"
            disabled
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #d1d5db",
              backgroundColor: "#f9fafb",
              color: "#6b7280"
            }}
          >
            연령/지역 필터 (곧 제공)
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 10 }}>
        <p style={{ margin: 0, color: "#374151", fontSize: 14 }}>
          총 {classes.length}개의 프로그램
        </p>
      </section>

      {error ? (
        <section style={{ ...sectionCardStyle, borderColor: "#fecaca" }}>
          <p style={{ margin: "0 0 10px", color: "#991b1b", fontSize: 14 }}>{error}</p>
          <Link href="/classes" style={{ color: "#2563eb", fontSize: 14 }}>
            다시 불러오기
          </Link>
        </section>
      ) : null}

      {!error && classes.length === 0 ? (
        <section style={sectionCardStyle}>
          <p style={{ margin: "0 0 8px", fontSize: 15 }}>
            현재 공개된 프로그램이 아직 없어요.
          </p>
          <p style={mutedTextStyle}>조금 뒤 다시 확인해 주세요.</p>
        </section>
      ) : null}

      {!error && classes.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {classes.map((item) => (
            <li key={item.id} style={sectionCardStyle}>
              {item.coverImageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.coverImageUrl}
                    alt={`${item.title} 대표 이미지`}
                    style={{
                      display: "block",
                      width: "100%",
                      height: 180,
                      objectFit: "cover",
                      borderRadius: 10,
                      marginBottom: 12
                    }}
                  />
                </>
              ) : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <span style={chipStyle}>{formatProgramType(item.programType)}</span>
                <span style={chipStyle}>{item.subject}</span>
                <span style={chipStyle}>{item.region}</span>
                <span style={chipStyle}>{item.targetAge}</span>
              </div>

              <h2 style={{ margin: "0 0 8px", fontSize: 18 }}>{item.title}</h2>
              <p style={{ ...mutedTextStyle, marginBottom: 8 }}>{item.description}</p>
              <p style={{ margin: "0 0 4px", fontSize: 14, color: "#111827" }}>
                {formatPrice(item.trialPrice)}
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 13, color: "#4b5563" }}>
                {item.teacherDisplayName || item.teacherName
                  ? `선생님 ${item.teacherDisplayName ?? item.teacherName}`
                  : "선생님 정보 준비 중"}
              </p>

              <div style={{ display: "flex", gap: 8 }}>
                <Link
                  href={`/classes/${item.id}`}
                  style={{
                    flex: 1,
                    textAlign: "center",
                    padding: "10px 12px",
                    borderRadius: 10,
                    backgroundColor: "#111827",
                    color: "#ffffff",
                    textDecoration: "none",
                    fontSize: 14
                  }}
                >
                  상세 보기
                </Link>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
