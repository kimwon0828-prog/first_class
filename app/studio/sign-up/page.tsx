import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioSignUpForm } from "@/features/studio/ui/studio-sign-up-form"
import styles from "../sign-in/page.module.css"

export default async function StudioSignUpPage() {
  const session = await getSession()
  if (session) {
    const profile = await getMyProfile()
    if (profile?.role === "teacher") {
      redirect("/studio/applications")
    }
    if (profile?.role === "parent") {
      redirect("/classes")
    }
    
    // Check if pending
    const { dataAdapter } = await import("@/shared/lib/db")
    const pendingRequest = await dataAdapter.getPendingTeacherSignupRequest(session.user.id)
    if (pendingRequest) {
      redirect("/studio/pending")
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/studio/sign-in" className={styles.backButton} aria-label="뒤로가기">
          〈
        </Link>
      </div>

      <h1 className={styles.title}>선생님 회원가입</h1>

      <section className={styles.hero}>
        <Image
          src="/images/first-class-logo.png"
          alt="첫수업"
          width={93}
          height={30}
          className={styles.logo}
          priority
        />
        <p className={styles.headline}>
          가입 신청을 하시면
          <br />
          관리자 승인 후 이용 가능합니다.
        </p>
      </section>

      <StudioSignUpForm />
    </main>
  )
}
