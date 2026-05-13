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

export default function ClassDetailLoading() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div style={{ ...skeletonBarStyle, width: "35%", marginBottom: 12 }} />
      <div style={{ display: "grid", gap: 10 }}>
        <section style={skeletonCardStyle}>
          <div style={{ ...skeletonBarStyle, width: "30%", marginBottom: 8 }} />
          <div style={{ ...skeletonBarStyle, width: "70%", marginBottom: 10 }} />
          <div style={{ ...skeletonBarStyle, width: "45%" }} />
        </section>

        <section style={skeletonCardStyle}>
          <div style={{ ...skeletonBarStyle, width: "40%", marginBottom: 8 }} />
          <div style={{ ...skeletonBarStyle, width: "100%", marginBottom: 6 }} />
          <div style={{ ...skeletonBarStyle, width: "90%" }} />
        </section>

        <section style={skeletonCardStyle}>
          <div style={{ ...skeletonBarStyle, width: "40%", marginBottom: 8 }} />
          <div style={{ ...skeletonBarStyle, width: "85%", marginBottom: 6 }} />
          <div style={{ ...skeletonBarStyle, width: "75%" }} />
        </section>
      </div>
    </main>
  )
}
