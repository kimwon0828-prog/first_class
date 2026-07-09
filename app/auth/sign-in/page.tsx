import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSession } from "@/features/auth/lib/session"
import { KakaoAuthButton } from "@/features/auth/ui/kakao-auth-button"
import styles from "./page.module.css"

type SignInPageProps = {
  searchParams?: Promise<{
    returnTo?: string
  }>
}

const resolveSafeReturnTo = (raw: string | undefined): string | null => {
  const value = (raw ?? "").trim()
  if (!value) {
    return null
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return null
  }

  return value
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const returnTo = resolveSafeReturnTo(resolvedSearchParams?.returnTo)
  const session = await getSession()
  if (session) {
    const profile = await getMyProfile()
    if (profile) {
      redirect(returnTo ?? resolvePostAuthRedirect(profile.role))
    }
    redirect(returnTo ?? "/classes")
  }

  const signUpHref = returnTo ? `/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}` : "/auth/sign-up"
  const emailSignInHref = returnTo
    ? `/auth/sign-in/email?returnTo=${encodeURIComponent(returnTo)}`
    : "/auth/sign-in/email"

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <Link href="/classes" className={styles.backButton} aria-label="뒤로가기">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M15 18l-6-6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      </div>

      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.brand}>
          <Image
            src="/images/first-class-logo.png"
            alt="첫수업"
            width={93}
            height={30}
            className={styles.logo}
            priority
          />
        </div>

        <div className={styles.copyGroup}>
          <h1 id="welcome-title" className={styles.title}>
            학원 선택의 기준을 바꾸다
            <br />
            첫수업에 오신 것을
            <br />
            환영합니다!
          </h1>
        </div>

        <div className={styles.actions}>
          <KakaoAuthButton label="카카오로 시작하기" next={returnTo ?? "/classes"} className={styles.kakaoButton} />

          <Link href={signUpHref} className={styles.emailButton}>
            이메일로 시작하기
          </Link>
        </div>

        <p className={styles.loginPrompt}>
          이미 계정이 있으신가요?{" "}
          <Link href={emailSignInHref} className={styles.loginLink}>
            이메일로 로그인
          </Link>
        </p>

        <p className={styles.teacherNotice}>
          선생님/학원 관리자이신가요?{" "}
          <Link href="/studio/sign-in" className={styles.teacherLink}>
            선생님 로그인
          </Link>
        </p>
      </section>
    </main>
  )
}
