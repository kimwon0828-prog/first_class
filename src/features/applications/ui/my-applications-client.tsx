"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"

import { MyApplicationList } from "@/features/applications/ui/my-application-list"
import type { ApplicationStatus, TrialApplicationSummary } from "@/shared/lib/db/adapter"
import styles from "../../../../app/my/applications/page.module.css"

type LoadState = "ready" | "error"

export type MyApplicationListItem = TrialApplicationSummary

const ACTIVE_STATUSES: ApplicationStatus[] = ["new", "reviewing", "confirmed"]
const CLOSED_STATUSES: ApplicationStatus[] = ["completed", "canceled"]

const resolvePageCopy = (statusFilter: string | null) => {
  if (statusFilter === "active") {
    return {
      title: "진행 중 신청",
      subtitle: "접수 이후 진행 중인 첫수업 신청만 모아볼 수 있어요.",
      emptyTitle: "진행 중인 신청이 없어요.",
      emptyDesc: "새 체험수업을 신청하거나 전체 신청 내역을 확인해보세요."
    }
  }

  if (statusFilter === "closed") {
    return {
      title: "완료/취소 신청",
      subtitle: "완료되었거나 취소된 첫수업 신청을 확인할 수 있어요.",
      emptyTitle: "완료 또는 취소된 신청이 없어요.",
      emptyDesc: "진행 중인 신청은 전체 신청 내역에서 확인할 수 있어요."
    }
  }

  return {
    title: "내 신청",
    subtitle: "신청한 첫수업 진행 상태를 확인할 수 있어요.",
    emptyTitle: "아직 신청한 첫수업이 없어요.",
    emptyDesc: "우리 아이에게 맞는 수업을 찾아보세요."
  }
}

const filterItemsByStatus = (items: MyApplicationListItem[], statusFilter: string | null) => {
  if (statusFilter === "active") {
    return items.filter((item) => ACTIVE_STATUSES.includes(item.status))
  }

  if (statusFilter === "closed") {
    return items.filter((item) => CLOSED_STATUSES.includes(item.status))
  }

  return items
}

type MyApplicationsClientProps = {
  initialItems: MyApplicationListItem[]
  initialError: string | null
}

export const MyApplicationsClient = ({
  initialItems,
  initialError
}: MyApplicationsClientProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get("status")
  const pageCopy = useMemo(() => resolvePageCopy(statusFilter), [statusFilter])
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

  const filteredItems = useMemo(() => filterItemsByStatus(items, statusFilter), [items, statusFilter])

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
          padding: "calc(18px + env(safe-area-inset-top)) 24px calc(96px + env(safe-area-inset-bottom))"
        }}
      >
        <header className={styles.header}>
          <h1 className={styles.title}>{pageCopy.title}</h1>
          <p className={styles.subtitle}>{pageCopy.subtitle}</p>
        </header>

        {status === "error" ? (
          <section className={`${styles.card} ${styles.dangerCard}`}>
            <p className={styles.dangerText}>{message}</p>
            <Link href="/classes" className={styles.link}>
              수업 찾으러 가기
            </Link>
          </section>
        ) : null}

        {status === "ready" && filteredItems.length === 0 ? (
          <section className={styles.emptyCard}>
            <h2 className={styles.emptyTitle}>{pageCopy.emptyTitle}</h2>
            <p className={styles.emptyDesc}>{pageCopy.emptyDesc}</p>
            <Link href="/classes" className={styles.primaryButton}>
              수업 찾으러 가기
            </Link>
          </section>
        ) : null}

        {status === "ready" && filteredItems.length > 0 ? (
          <MyApplicationList items={filteredItems} onCanceled={handleCanceled} />
        ) : null}
      </div>

      <nav className={styles.bottomNav} aria-label="Bottom tabs">
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
