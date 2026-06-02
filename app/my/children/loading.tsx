export default function MyChildrenLoading() {
  return (
    <main style={{ background: "#ffffff", minHeight: "100dvh", width: "100%", overflowX: "hidden" }}>
      <div
        style={{
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          padding: "calc(18px + env(safe-area-inset-top)) 24px calc(40px + env(safe-area-inset-bottom))"
        }}
      >
        <header style={{ display: "grid", gap: 10, marginBottom: 24 }}>
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
            자녀 관리
          </h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#8a8a8a" }}>
            자녀 정보를 등록해두면 첫수업 신청이 더 편해져요.
          </p>
        </header>

        <section
          style={{
            border: "1px solid #eeeeee",
            borderRadius: 20,
            padding: 18,
            background: "#f3fbf4",
            marginBottom: 24
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#2f2f2f" }}>
            자녀 정보를 미리 등록해두면 신청서 작성 시 아이 이름과 학년을 자동으로 불러올 수 있어요.
          </p>
        </section>

        <section
          style={{
            border: "1px solid #eeeeee",
            borderRadius: 20,
            background: "#ffffff",
            padding: 20
          }}
        >
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#666666" }}>
            자녀 정보를 불러오는 중입니다...
          </p>
        </section>
      </div>
    </main>
  )
}
