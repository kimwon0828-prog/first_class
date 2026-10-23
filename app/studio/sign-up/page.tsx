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

      {/* 단계 (Figma 2148:4769). 계정과 학원 정보를 한 화면에서 받으므로 두 단계를 함께 "지금"으로 보인다. */}
      <ol className={styles.steps} aria-label="가입 단계">
        <li data-state="current" aria-current="step"><span className={styles.stepDot}>1</span>계정 만들기</li>
        <li className={styles.stepLine} data-state="current" aria-hidden="true" />
        <li data-state="current"><span className={styles.stepDot}>2</span>학원 정보</li>
        <li className={styles.stepLine} aria-hidden="true" />
        <li><span className={styles.stepDot}>3</span>첫수업 팀 확인</li>
      </ol>

      <section className={styles.card} aria-labelledby="studio-sign-up-title">
        <div className={styles.cardHead}>
          <h1 id="studio-sign-up-title" className={styles.title}>학원을 알려주세요</h1>
          <p className={styles.description}>학부모 앱에 보이는 정보예요. 승인 뒤 설정에서 정보 수정을 요청할 수 있어요.</p>
        </div>
        <StudioSignUpForm />
        <p className={styles.note}>첫수업 팀이 1영업일 안에 학원 정보를 확인해요. 승인되면 바로 수업을 등록할 수 있어요.</p>
      </section>
    </main>
  )
}
