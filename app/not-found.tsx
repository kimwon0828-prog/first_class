import Link from "next/link"

export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: 430,
        margin: "0 auto",
        minHeight: "100dvh",
        boxSizing: "border-box",
        padding: "calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))",
        background: "#ffffff"
      }}
    >
      <h1 style={{ margin: "0 0 10px", fontSize: 22, lineHeight: "28px", color: "#111111" }}>
        페이지를 찾을 수 없어요
      </h1>
      <p style={{ margin: "0 0 18px", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
        주소가 변경되었거나 존재하지 않는 경로입니다.
      </p>
      <Link
        href="/classes"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          height: 40,
          padding: "0 14px",
          borderRadius: 999,
          border: "1px solid #eeeeee",
          textDecoration: "none",
          color: "#111111",
          fontSize: 13,
          fontWeight: 700
        }}
      >
        수업 목록으로 이동
      </Link>
    </main>
  )
}

