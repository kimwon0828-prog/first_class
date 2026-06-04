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
    if (profile?.role === "academy" || profile?.role === "admin") {
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

      <h1 className={styles.title}>학원 계정 신청</h1>

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
          학원 계정을 신청하시면
          <br />
          관리자 승인 후 Studio를 이용할 수 있습니다.
        </p>
      </section>

      <StudioSignUpForm />
    </main>
  )
}
