import Link from "next/link"
import { redirect } from "next/navigation"

import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { getSupabaseServerClient } from "@/integrations/supabase/server"

type StudioAccessPageProps = {
  searchParams?: Promise<{
    reason?: string
  }>
}

const getReasonCopy = (reason: string | null) => {
  if (reason === "missing_org") {
    return {
      title: "학원 정보 연결이 필요합니다",
      description: "계정은 로그인되어 있지만 organization 연결이 없어 Studio 기능을 사용할 수 없습니다."
    }
  }

  if (reason === "missing_teacher_mapping") {
    return {
      title: "선생님 매핑이 필요합니다",
      description:
        "계정은 로그인되어 있지만 teachers 매핑이 없어 Studio 기능을 사용할 수 없습니다. 관리자에게 연결을 요청해 주세요."
    }
  }

  if (reason === "no_teachers") {
    return {
      title: "학원 선생님 데이터가 없습니다",
      description: "organization에 연결된 teachers 데이터가 없어 Studio를 사용할 수 없습니다."
    }
  }

  if (reason === "invalid_role") {
    return {
      title: "권한 정보를 확인할 수 없습니다",
      description: "프로필 role 값이 예상과 달라 Studio 접근을 제한했습니다."
    }
  }

  if (reason === "missing_profile") {
    return {
      title: "프로필 정보를 찾을 수 없습니다",
      description: "계정은 로그인되어 있지만 profiles 정보가 없어 Studio 기능을 사용할 수 없습니다."
    }
  }

  return {
    title: "Studio 접근을 확인해 주세요",
    description: "계정 연결 상태를 확인한 뒤 다시 시도해 주세요."
  }
}

export default async function StudioAccessPage({ searchParams }: StudioAccessPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const reasonRaw = typeof resolvedSearchParams?.reason === "string" ? resolvedSearchParams.reason : ""
  const reason = reasonRaw.trim() || null
  const copy = getReasonCopy(reason)

  const supabase = await getSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/studio/sign-in")
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "48px 24px",
        background: "#f9fafb",
        minHeight: "100dvh"
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <div style={{ marginBottom: 12 }}>
          <StudioHomeLogo />
        </div>
        <p style={{ margin: "0 0 8px", fontSize: 13, lineHeight: "18px", color: "#4f46e5" }}>
          FIRST CLASS STUDIO
        </p>
        <h1 style={{ margin: 0, fontSize: 26, lineHeight: "32px", color: "#111827" }}>{copy.title}</h1>
        <p style={{ margin: "12px 0 0", fontSize: 14, lineHeight: "20px", color: "#4b5563" }}>
          {copy.description}
        </p>
      </header>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          background: "#ffffff",
          padding: 16
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Link
            href="/classes"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            학부모 화면 보기
          </Link>
          <Link
            href="/studio/sign-out"
            prefetch={false}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            로그아웃
          </Link>
          <Link
            href="/studio"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: 36,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              color: "#111827",
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 600
            }}
          >
            Studio로 돌아가기
          </Link>
        </div>

        {reason ? (
          <p style={{ margin: "14px 0 0", fontSize: 12, lineHeight: "18px", color: "#6b7280" }}>
            debug_reason={reason}
          </p>
        ) : null}
      </section>
    </main>
  )
}
