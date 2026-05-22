import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { MyChildrenManager } from "@/features/children/ui/my-children-manager"

export default async function MyChildrenPage() {
  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    redirect("/")
  }

  const { data, error } = await getMyChildren()

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px 40px" }}>
      <div style={{ marginBottom: 12 }}>
        <Link href="/my" style={{ color: "#2563eb", fontSize: 14 }}>
          ← 마이페이지로 돌아가기
        </Link>
      </div>

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>자녀 관리</h1>
        <p style={{ margin: 0, fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>
          자녀 정보를 미리 등록해 두면 이후 체험수업이나 레벨테스트 신청 시 반복 입력을 줄일 수 있습니다.
        </p>
      </header>

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
          <Link href="/my" style={{ color: "#2563eb", fontSize: 14 }}>
            마이페이지로 이동
          </Link>
        </section>
      ) : (
        <MyChildrenManager items={data} />
      )}
    </main>
  )
}
