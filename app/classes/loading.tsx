import type { CSSProperties } from "react"

const skeletonCardStyle: CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14
}

const skeletonBarStyle: CSSProperties = {
  height: 10,
  borderRadius: 6,
  backgroundColor: "#e5e7eb"
}

export default function ClassesLoading() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 32px" }}>
      <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>체험수업 찾기</h1>
      <div style={{ display: "grid", gap: 10 }}>
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} style={skeletonCardStyle}>
            <div style={{ ...skeletonBarStyle, width: "40%", marginBottom: 8 }} />
            <div style={{ ...skeletonBarStyle, width: "70%", marginBottom: 10 }} />
            <div style={{ ...skeletonBarStyle, width: "100%", marginBottom: 6 }} />
            <div style={{ ...skeletonBarStyle, width: "90%" }} />
          </div>
        ))}
      </div>
    </main>
  )
}
