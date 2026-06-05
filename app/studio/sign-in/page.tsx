import { redirect } from "next/navigation"
import Image from "next/image"

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

    if (profile?.role === "academy" || profile?.role === "admin") {
      redirect(returnTo ?? "/studio")
    }

    redirect("/classes")
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.brand}>
          <Image
            src="/images/first-class-logo.png"
            alt="첫수업"
            width={132}
            height={44}
            priority
            className={styles.logo}
          />
          <p className={styles.kicker}>첫수업 운영보드</p>
          <h1 className={styles.headline}>
            체험수업 신청부터 상담,
            <br />
            등록 전환까지 한 곳에서 관리하세요.
          </h1>
          <p className={styles.subcopy}>
            학원에 들어온 첫수업 신청을 빠르게 확인하고 상담 상태를 놓치지 않도록 도와드려요.
          </p>

          <ul className={styles.points}>
            <li className={styles.point}>
              <span className={styles.pointIcon} aria-hidden="true" />
              신규 신청 확인
            </li>
            <li className={styles.point}>
              <span className={styles.pointIcon} aria-hidden="true" />
              상담 메모 관리
            </li>
            <li className={styles.point}>
              <span className={styles.pointIcon} aria-hidden="true" />
              수업 일정 확인
            </li>
            <li className={styles.point}>
              <span className={styles.pointIcon} aria-hidden="true" />
              등록 전환 관리
            </li>
          </ul>
        </section>

        <section className={styles.card} aria-label="선생님 로그인">
          <header className={styles.cardHeader}>
            <span className={styles.badge}>Teacher Studio</span>
            <h2 className={styles.cardTitle}>선생님 로그인</h2>
            <p className={styles.cardDescription}>
              첫수업 운영보드에 로그인해 신청 현황을 확인하세요.
            </p>
          </header>

          <div className={styles.formArea}>
            <StudioSignInForm returnTo={returnTo ?? undefined} />
          </div>

          <p className={styles.notice}>
            운영자 계정은 첫수업에 등록된 학원/선생님만 사용할 수 있어요.
          </p>
        </section>
      </div>
    </main>
  )
}
