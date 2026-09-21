import Link from "next/link"
import type { ReactNode } from "react"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import styles from "./page.module.css"

export function MyFrame({ children }: { children: ReactNode }) {
  return <main className={styles.page} data-parent-design="v1">
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>마이페이지</h1>
        <Link href="/notifications" className={styles.notification} aria-label="알림">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
    <ParentBottomNav designVersion="v1" />
  </main>
}
