"use client"

import Link from "next/link"

export default function StudioClassesError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  void error

  return (
    <div
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: "32px 24px 48px",
        background: "#f9fafb"
      }}
    >
      <section
        style={{
          border: "1px solid #fecaca",
          borderRadius: 16,
          background: "#fff",
          padding: 20
        }}
        role="alert"
      >
        <h1 style={{ margin: 0, fontSize: 20, lineHeight: "26px", color: "#111827" }}>
          수업 정보를 불러오지 못했어요.
        </h1>
        <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: "20px", color: "#6b7280" }}>
          잠시 후 다시 시도해 주세요.
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #2AAD38",
              background: "#2AAD38",
              color: "white",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer"
            }}
          >
            다시 시도
          </button>
          <Link
            href="/studio"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#111827",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none"
            }}
          >
            Studio로 이동
          </Link>
          <Link
            href="/studio/access"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 40,
              padding: "0 14px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#111827",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none"
            }}
          >
            계정 상태 확인
          </Link>
        </div>
      </section>
    </div>
  )
}
