import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getMyDashboard } from "@/features/my/queries/get-my-dashboard"
import { MyDashboardHome } from "@/features/my/ui/my-dashboard-home"
import styles from "./page.module.css"

export default async function MyPage() {
  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile) {
    redirect("/classes")
  }

  if (profile.role !== "parent") {
    redirect("/studio")
  }

  const { data, error } = await getMyDashboard()

  return (
    <main
      className={styles.page}
      style={{ background: "#ffffff", minHeight: "100dvh", width: "100%", overflowX: "hidden" }}
    >
      <div
        className={styles.shell}
        style={{
          boxSizing: "border-box",
          width: "100%",
          maxWidth: 430,
          margin: "0 auto",
          minHeight: "100dvh",
          background: "#ffffff",
          padding: "calc(18px + env(safe-area-inset-top)) 24px calc(40px + env(safe-area-inset-bottom))"
        }}
      >
        <header className={styles.header}>
          <h1 className={styles.title}>마이페이지</h1>
        </header>

        {error ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{error}</p>
            <Link href="/classes" className={styles.link}>
              수업 찾으러 가기
            </Link>
          </section>
        ) : (
          <MyDashboardHome profileName={profile.name} profilePhone={profile.phone} dashboard={data} />
        )}

        <section className={styles.logoutSection}>
          <Link href="/auth/sign-out" className={styles.logoutButton}>
            로그아웃
          </Link>
        </section>
      </div>
    </main>
  )
}
