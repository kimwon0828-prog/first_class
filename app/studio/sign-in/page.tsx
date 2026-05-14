import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/queries/get-my-profile"
import { getSession } from "@/features/auth/lib/session"
import { StudioSignInForm } from "@/features/studio/ui/studio-sign-in-form"
import styles from "./page.module.css"

type StudioSignInPageProps = {
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

export default async function StudioSignInPage({ searchParams }: StudioSignInPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const returnTo = resolveSafeReturnTo(resolvedSearchParams?.returnTo)
  const session = await getSession()

  if (session) {
    const profile = await getMyProfile()

    if (profile?.role === "teacher") {
      redirect(returnTo ?? "/studio/applications")
    }

    redirect("/classes")
  }

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        <p className={styles.eyebrow}>FIRST CLASS STUDIO</p>
        <h1 className={styles.title}>teacher 로그인</h1>
        <p className={styles.description}>
          본인 organization 범위의 체험 신청을 확인하고 상태를 처리하는 studio 진입 화면입니다.
        </p>

        <StudioSignInForm returnTo={returnTo ?? undefined} />
      </section>
    </main>
  )
}
