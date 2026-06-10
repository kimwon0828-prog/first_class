import Link from "next/link"
import Image from "next/image"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioSignUpForm } from "@/features/studio/ui/studio-sign-up-form"
import styles from "./page.module.css"

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
      <div className={styles.container}>
        <header className={styles.topBar}>
          <Image
            src="/images/first-class-logo.png"
            alt="첫수업"
            width={93}
            height={30}
            className={styles.logo}
            priority
          />
        </header>

        <div className={styles.grid}>
          <section className={styles.intro} aria-label="운영보드 소개">
            <p className={styles.kicker}>첫수업 for Academy</p>
            <h1 className={styles.title}>첫수업 운영보드 계정을 신청하세요</h1>
            <p className={styles.subtitle}>
              체험수업 신청부터 상담, 일정, 등록 전환까지 한 곳에서 관리할 수 있어요.
            </p>
            <p className={styles.subtle}>
              신청서를 남겨주시면 확인 후 운영자 계정 안내를 도와드립니다.
            </p>

            <ul className={styles.benefits} aria-label="운영보드 장점">
              <li className={styles.benefitItem}>
                <span className={styles.benefitDot} aria-hidden="true" />
                신규 신청을 한눈에 확인
              </li>
              <li className={styles.benefitItem}>
                <span className={styles.benefitDot} aria-hidden="true" />
                상담 상태와 메모 기록
              </li>
              <li className={styles.benefitItem}>
                <span className={styles.benefitDot} aria-hidden="true" />
                체험수업/레벨테스트 일정 관리
              </li>
              <li className={styles.benefitItem}>
                <span className={styles.benefitDot} aria-hidden="true" />
                등록 전환율 확인
              </li>
              <li className={styles.benefitItem}>
                <span className={styles.benefitDot} aria-hidden="true" />
                수업 노출 정보 관리
              </li>
            </ul>

            <div className={styles.noteCard}>
              <p className={styles.noteTitle}>안내</p>
              <p className={styles.noteBody}>
                신청 후 계정이 바로 활성화되지 않을 수 있어요. 운영팀 확인 후 승인되면 운영보드를 이용할 수 있습니다.
              </p>
            </div>
          </section>

          <section className={styles.formCard} aria-label="학원 계정 신청 폼">
            <header className={styles.formHeader}>
              <h2 className={styles.formTitle}>학원 계정 신청</h2>
              <p className={styles.formDescription}>운영보드 사용을 위해 기본 정보를 입력해 주세요.</p>
            </header>
            <StudioSignUpForm />
          </section>
        </div>

        <footer className={styles.footer}>
          <p className={styles.footerText}>
            이미 계정이 있으신가요?{" "}
            <Link href="/studio/sign-in" className={styles.footerLink}>
              운영보드 로그인
            </Link>
          </p>
        </footer>
      </div>
    </main>
  )
}
