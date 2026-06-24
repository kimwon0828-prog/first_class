"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import styles from "./studio-shell.module.css"

type StudioShellProps = {
  children: ReactNode
}

type NavItem = {
  href: string
  label: string
}

const NAV_ITEMS: NavItem[] = [
  { href: "/studio", label: "대시보드" },
  { href: "/studio/applications", label: "신청 관리" },
  { href: "/studio/classes", label: "수업 관리" },
  { href: "/studio/schedule", label: "일정 관리" },
  { href: "/studio/teachers", label: "선생님 관리" },
  { href: "/studio/settings", label: "학원 설정" }
]

const isActivePath = (pathname: string, href: string) => {
  if (href === "/studio") {
    return pathname === "/studio"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export const StudioShell = ({ children }: StudioShellProps) => {
  const pathname = usePathname() ?? ""

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Studio 메뉴">
        <div className={styles.sidebarTop}>
          <StudioHomeLogo className={styles.logoLink} />
          <p className={styles.logoLabel}>운영보드</p>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                aria-current={active ? "page" : undefined}
              >
                <span className={styles.navDot} aria-hidden="true" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.accountCard}>
            <p className={styles.accountLabel}>첫수업 Studio</p>
            <div className={styles.accountActions}>
              <Link href="/studio/sign-out" prefetch={false} className={styles.accountLink}>
                로그아웃
              </Link>
            </div>
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
