export default function StudioDashboardLoading() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        padding: "32px",
        background: "#f8fafc"
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <div
          style={{
            height: 96,
            borderRadius: 24,
            background: "#e2e8f0",
            marginBottom: 24
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginBottom: 24
          }}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              style={{
                height: 128,
                borderRadius: 20,
                background: "#e2e8f0"
              }}
            />
          ))}
        </div>
        <div
          style={{
            height: 360,
            borderRadius: 24,
            background: "#e2e8f0"
          }}
        />
      </div>
    </div>
  )
}
