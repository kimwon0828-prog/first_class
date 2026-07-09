import Link from "next/link"
import { redirect } from "next/navigation"

import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSession } from "@/features/auth/lib/session"
import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { SignInForm } from "@/features/auth/ui/sign-in-form"
import styles from "./page.module.css"

type EmailSignInPageProps = {
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

export default async function EmailSignInPage({ searchParams }: EmailSignInPageProps) {
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

  const welcomeHref = returnTo ? `/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}` : "/auth/sign-in"

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href={welcomeHref} aria-label="뒤로가기" className={styles.backButton}>
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
        <div className={styles.copyGroup}>
          <p className={styles.eyebrow}>이메일 로그인</p>
          <h1 className={styles.title}>기존 계정으로 로그인</h1>
          <p className={styles.description}>이메일 찾기와 비밀번호 재설정도 이 화면에서 계속 이용할 수 있어요.</p>
        </div>
      </header>

      <section className={styles.formCard}>
        <SignInForm returnTo={returnTo ?? undefined} showKakaoButton={false} compact />
      </section>
    </main>
  )
}
