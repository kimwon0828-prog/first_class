import { redirect } from "next/navigation"
import Link from "next/link"
import Image from "next/image"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { resolvePostAuthRedirect } from "@/features/auth/lib/redirect"
import { getSession } from "@/features/auth/lib/session"
import { SignInForm } from "@/features/auth/ui/sign-in-form"
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

  return (
    <main
      className={styles.page}
      style={{
        margin: "0 auto",
        width: "100%",
        maxWidth: 430,
        minHeight: "100dvh",
        boxSizing: "border-box",
        overflowX: "hidden",
        padding: "calc(14px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom))",
        background: "#ffffff"
      }}
    >
      <div className={styles.topBar}>
        <Link href="/classes" className={styles.backButton} aria-label="뒤로가기">
          〈
        </Link>
      </div>

      <h1 className={styles.title}>로그인</h1>

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
          학원 선택의 시작은
          <br />
          상담이 아니라 첫 수업이어야 합니다.
        </p>
        <p className={styles.description}>회원 서비스 이용을 위해 로그인 해주세요.</p>
      </section>

      <SignInForm returnTo={returnTo ?? undefined} />
    </main>
  )
}
