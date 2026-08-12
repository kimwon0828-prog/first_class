"use client"

import Link from "next/link"
import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { MyApplicationList } from "@/features/applications/ui/my-application-list"
import type { TrialApplicationSummary } from "@/shared/lib/db/adapter"
import styles from "../../../../app/my/applications/page.module.css"

type LoadState = "ready" | "error"

export type MyApplicationListItem = TrialApplicationSummary

type MyApplicationsClientProps = {
  initialItems: MyApplicationListItem[]
  initialError: string | null
}

export const MyApplicationsClient = ({
  initialItems,
  initialError
}: MyApplicationsClientProps) => {
  const router = useRouter()
  const [items, setItems] = useState<MyApplicationListItem[]>(initialItems)
  const [status, setStatus] = useState<LoadState>(initialError ? "error" : "ready")
  const [message, setMessage] = useState(initialError ?? "")

  useEffect(() => {
    setItems(initialItems)
    setStatus(initialError ? "error" : "ready")
    setMessage(initialError ?? "")
  }, [initialError, initialItems])

  const handleCanceled = useCallback(async () => {
    router.refresh()
  }, [router])

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>내 신청</h1>
        </header>

        <div className={styles.content}>
          {status === "error" ? (
            <section className={`${styles.card} ${styles.dangerCard}`}>
              <p className={styles.dangerText}>{message}</p>
              <Link href="/classes" className={styles.link}>
                수업 둘러보기
              </Link>
            </section>
          ) : null}

          {status === "ready" && items.length === 0 ? (
            <section className={styles.emptyState}>
              <div className={styles.emptyInner}>
                <h2 className={styles.emptyTitle}>아직 신청한 체험수업이 없어요</h2>
                <p className={styles.emptyDesc}>우리 아이에게 맞는 수업을 찾아보세요</p>
                <Link href="/classes" className={styles.primaryButton}>
                  수업 둘러보기
                </Link>
              </div>
            </section>
          ) : null}

          {status === "ready" && items.length > 0 ? (
            <MyApplicationList items={items} onCanceled={handleCanceled} />
          ) : null}
        </div>
      </div>

      <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href="/classes" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link href="/favorites" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link href="/my/applications" className={`${styles.navItem} ${styles.navItemActive}`}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>내 신청</span>
        </Link>
      </nav>
    </main>
  )
}
