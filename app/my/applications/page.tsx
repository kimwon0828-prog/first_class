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
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
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
    </main>
  )
}
