import Link from "next/link"
import { redirect } from "next/navigation"

import { getMyProfile } from "@/features/auth/lib/profile-sync"
import { requireSession } from "@/features/auth/lib/session"
import { getMyChildren } from "@/features/children/queries/get-my-children"
import { MyChildrenManager } from "@/features/children/ui/my-children-manager"
import styles from "./page.module.css"

export default async function MyChildrenPage() {
  await requireSession("/auth/sign-in")
  const profile = await getMyProfile()

  if (!profile || profile.role !== "parent") {
    redirect("/")
  }

  const { data, error } = await getMyChildren()

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
          <div className={styles.headerRow}>
            <Link href="/my" aria-label="뒤로가기" className={styles.backButton}>
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
            <div className={styles.headerSpacer} />
          </div>

          <h1 className={styles.title}>자녀 관리</h1>
          <p className={styles.subtitle}>자녀 정보를 등록해두면 첫수업 신청이 더 편해져요.</p>
        </header>

        <section className={styles.noticeCard}>
          <p className={styles.noticeText}>
            자녀 정보를 미리 등록해두면 신청서 작성 시 아이 이름과 학년을 자동으로 불러올 수 있어요.
          </p>
        </section>

        {error ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{error}</p>
            <Link href="/my" className={styles.link}>
              마이페이지로 이동
            </Link>
          </section>
        ) : (
          <MyChildrenManager items={data} />
        )}
      </div>
    </main>
  )
}
