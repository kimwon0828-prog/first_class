import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { MyApplicationList } from "@/features/applications/ui/my-application-list"

export default async function MyApplicationsPage() {
  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    redirect("/")
  }

  const { data, error } = await getMyApplications()

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 120px" }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/my" style={{ color: "#2563eb", fontSize: 14 }}>
          ← 마이페이지로 돌아가기
        </Link>
      </div>

      <h1 style={{ margin: "0 0 12px", fontSize: 24 }}>신청 내역</h1>

      {error ? (
        <section
          style={{
            border: "1px solid #fecaca",
            borderRadius: 12,
            backgroundColor: "#fff",
            padding: 14
          }}
        >
          <p style={{ margin: "0 0 8px", color: "#991b1b", fontSize: 14 }}>{error}</p>
          <Link href="/classes" style={{ color: "#2563eb", fontSize: 14 }}>
            수업 보러가기
          </Link>
        </section>
      ) : null}

      {!error && data.length === 0 ? (
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            backgroundColor: "#fff",
            padding: 14
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 14, color: "#4b5563" }}>
            아직 신청한 내역이 없습니다.
          </p>
          <Link href="/classes" style={{ color: "#2563eb", fontSize: 14 }}>
            프로그램 둘러보기
          </Link>
        </section>
      ) : null}

      {!error && data.length > 0 ? <MyApplicationList items={data} /> : null}

      <nav
        aria-label="하단 탭"
        style={{
          position: "fixed",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: "min(100%, 640px)",
          height: 76,
          background: "#ffffff",
          borderTop: "1px solid #eeeeee",
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 24px 14px"
        }}
      >
        <Link
          href="/classes"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            textDecoration: "none",
            color: "#111111",
            fontSize: 11,
            WebkitTapHighlightColor: "transparent"
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link
          href="/favorites"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            textDecoration: "none",
            color: "#111111",
            fontSize: 11,
            WebkitTapHighlightColor: "transparent"
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link
          href="/my/applications"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            textDecoration: "none",
            color: "#2aad38",
            fontSize: 11,
            WebkitTapHighlightColor: "transparent"
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>내 신청</span>
        </Link>
      </nav>
    </main>
  )
}
