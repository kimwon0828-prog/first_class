export default function StudioApplicationDetailLoading() {
  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 48px" }}>
      <div
        style={{
          height: 20,
          width: 120,
          borderRadius: 8,
          background: "#f3f4f6",
          marginBottom: 16
        }}
      />
      <div
        style={{
          height: 28,
          width: 300,
          borderRadius: 8,
          background: "#e5e7eb",
          marginBottom: 24
        }}
      />
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }}>
        <div
          style={{
            height: 420,
            borderRadius: 16,
            background: "#fff",
            border: "1px solid #e5e7eb"
          }}
        />
        <div
          style={{
            height: 220,
            borderRadius: 16,
            background: "#fff",
            border: "1px solid #e5e7eb"
          }}
        />
      </div>
    </div>
  )
}

