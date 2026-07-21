"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useState, useTransition } from "react"

import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import styles from "./studio-shell.module.css"

type StudioShellProps = {
  children: ReactNode
  organizationName?: string | null
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
  { href: "/studio/teachers", label: "선생님 관리" }
]

const isActivePath = (pathname: string, href: string) => {
  if (href === "/studio") {
    return pathname === "/studio"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export const StudioShell = ({ children, organizationName }: StudioShellProps) => {
  const pathname = usePathname() ?? ""
  const router = useRouter()
  const accountLabel = organizationName?.trim() || "학원"
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [isSettingsPending, startSettingsTransition] = useTransition()

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Studio 메뉴">
        <div className={styles.sidebarTop}>
          <StudioHomeLogo className={styles.logoLink} />
          <p className={styles.logoLabel}>파트너 센터</p>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.navItemActive : ""} ${
                  pendingHref === item.href ? styles.navItemPending : ""
                }`}
                aria-current={active ? "page" : undefined}
                aria-busy={pendingHref === item.href}
                onClick={() => {
                  if (!active) {
                    setPendingHref(item.href)
                  }
                }}
              >
                <span className={styles.navDot} aria-hidden="true" />
                <span>{item.label}</span>
                {pendingHref === item.href ? <span className={styles.navPendingText}>이동 중...</span> : null}
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <div
            className={`${styles.accountCard} ${isSettingsPending ? styles.accountCardPending : ""}`}
            role="button"
            tabIndex={0}
            onClick={() =>
              startSettingsTransition(() => {
                router.push("/studio/settings")
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                startSettingsTransition(() => {
                  router.push("/studio/settings")
                })
              }
            }}
            aria-label="학원 정보 보기"
            aria-busy={isSettingsPending}
          >
            <p className={styles.accountLabel}>{accountLabel}</p>
            {isSettingsPending ? <p className={styles.accountPendingText}>불러오는 중...</p> : null}
            <div className={styles.accountActions}>
              <Link
                href="/studio/sign-out"
                prefetch={false}
                className={styles.accountLink}
                onClick={(event) => event.stopPropagation()}
              >
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
