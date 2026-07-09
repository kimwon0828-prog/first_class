import Link from "next/link"

import { resolveOAuthConflictMessage } from "@/features/auth/lib/oauth-account-conflict"
import styles from "./page.module.css"

type AccountConflictPageProps = {
  searchParams?: Promise<{
    reason?: string
  }>
}

const resolveConflictReason = (value: string | undefined) => {
  if (value === "existing_email_account" || value === "studio_account" || value === "account_check_failed") {
    return value
  }

  return "account_check_failed"
}

export default async function AccountConflictPage({ searchParams }: AccountConflictPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const reason = resolveConflictReason(resolvedSearchParams?.reason)
  const message = resolveOAuthConflictMessage(reason)
  const isStudioReason = reason === "studio_account"

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>계정 안내</p>
        <h1 className={styles.title}>로그인 방식을 확인해 주세요</h1>
        <p className={styles.message}>{message}</p>

        <div className={styles.actions}>
          {isStudioReason ? (
            <Link href="/studio/sign-in" className={styles.primaryButton}>
              스튜디오 로그인
            </Link>
          ) : (
            <Link href="/auth/sign-in/email" className={styles.primaryButton}>
              이메일 로그인
            </Link>
          )}

          <Link href="/auth/sign-in" className={styles.secondaryButton}>
            로그인 화면으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  )
}
