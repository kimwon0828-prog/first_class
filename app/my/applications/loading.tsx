export default function MyApplicationsLoading() {
  return (
    <main style={{ background: "#ffffff", minHeight: "100dvh", width: "100%", overflowX: "hidden" }}>
      <div
        style={{
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          padding: "calc(18px + env(safe-area-inset-top)) 24px calc(96px + env(safe-area-inset-bottom))"
        }}
      >
        <header style={{ display: "grid", gap: 10, marginBottom: 28 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              lineHeight: 1.25,
              fontWeight: 800,
              letterSpacing: "-0.04em",
              color: "#111111"
            }}
          >
            내 신청
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#8a8a8a" }}>
            신청한 첫수업 진행 상태를 확인할 수 있어요.
          </p>
        </header>

        <section
          style={{
            border: "1px solid #eeeeee",
            borderRadius: 20,
            background: "#ffffff",
            padding: 20
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#666666" }}>
            신청 내역을 불러오는 중입니다...
          </p>
        </section>
      </div>
    </main>
  )
}
