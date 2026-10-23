import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import { StudioSignUpForm } from "@/features/studio/ui/studio-sign-up-form"
import { getParentCrossProductHref } from "@/shared/config/cross-product-navigation"
import { getRequestHostname } from "@/shared/lib/request-host"
import { getStudioNavigationPathResolver } from "@/shared/lib/studio-navigation-server"
import styles from "./page.module.css"

export default async function StudioSignUpPage() {
  const studioPath = await getStudioNavigationPathResolver()
  const session = await getSession()
  if (session) {
    const profile = await getMyProfile()
    if (profile?.role === "academy" || profile?.role === "admin") {
      redirect(studioPath("/studio/cases"))
    }
    if (profile?.role === "parent") {
      /* 학부모 세션은 Parent origin 으로 내보낸다. 같은 host 로 보내면 되돌아온다. */
      redirect(getParentCrossProductHref({ pathname: "/classes", hostname: await getRequestHostname() }))
    }
    
    // Check if pending
    const { dataAdapter } = await import("@/shared/lib/db")
    const pendingRequest = await dataAdapter.getPendingTeacherSignupRequest(session.user.id)
    if (pendingRequest) {
      redirect(studioPath("/studio/pending"))
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <StudioHomeLogo width={79} height={27} priority />
        <Link href={studioPath("/studio/sign-in")} className={styles.topLink}>이미 계정이 있어요 · 로그인</Link>
      </header>

      {/* 단계 표시와 카드는 폼이 그린다 — 단계(1 계정 · 2 학원 정보)가 폼 안 상태라서. */}
      <StudioSignUpForm />
    </main>
  )
}
