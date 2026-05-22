import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getMyDashboard } from "@/features/my/queries/get-my-dashboard"
import { MyDashboardHome } from "@/features/my/ui/my-dashboard-home"

export default async function MyPage() {
  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    redirect("/")
  }

  const { data, error } = await getMyDashboard()

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
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
            프로그램 보러가기
          </Link>
        </section>
      ) : (
        <MyDashboardHome
          profileName={profile.name}
          profilePhone={profile.phone}
          dashboard={data}
        />
      )}
    </main>
  )
}
