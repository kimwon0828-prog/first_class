"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import styles from "./studio-shell.module.css"

const PROFILE_ASSET_BUCKET = "academy-profile-assets"

type StudioShellProps = {
  children: ReactNode
  organizationName?: string | null
  logoImagePath?: string | null
  consultationLeadCount?: number
}

type NavItem = {
  href: string
  label: string
  badgeCount?: number
}

const isActivePath = (pathname: string, href: string) => {
  if (href === "/studio") {
    return pathname === "/studio"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

export const StudioShell = ({
  children,
  organizationName,
  logoImagePath,
  consultationLeadCount = 0
}: StudioShellProps) => {
  const pathname = usePathname() ?? ""
  const accountLabel = organizationName?.trim() || "학원"
  const accountInitial = accountLabel.slice(0, 1)
  const mypageHref = "/studio/mypage"
  const isMypageActive = isActivePath(pathname, mypageHref)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [isLogoImageBroken, setIsLogoImageBroken] = useState(false)
  const navItems: NavItem[] = [
    { href: "/studio", label: "대시보드" },
    { href: "/studio/applications", label: "신청 관리" },
    {
      href: "/studio/unregistered",
      label: "상담 관리",
      badgeCount: consultationLeadCount > 0 ? consultationLeadCount : undefined
    },
    { href: "/studio/classes", label: "수업 관리" },
    { href: "/studio/schedule", label: "일정 관리" },
    { href: "/studio/teachers", label: "선생님 관리" }
  ]

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  useEffect(() => {
    setIsLogoImageBroken(false)
  }, [logoImagePath])

  const logoImageUrl = useMemo(() => {
    if (!logoImagePath) {
      return null
    }

    const {
      data: { publicUrl }
    } = getSupabaseBrowserClient().storage.from(PROFILE_ASSET_BUCKET).getPublicUrl(logoImagePath)

    return publicUrl || null
  }, [logoImagePath])

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Studio 메뉴">
        <div className={styles.sidebarTop}>
          <StudioHomeLogo className={styles.logoLink} />
          <p className={styles.logoLabel}>파트너 센터</p>
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => {
            const active = isActivePath(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
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
                <span className={styles.navLabel}>{item.label}</span>
                {item.badgeCount ? <span className={styles.navBadge}>{item.badgeCount}</span> : null}
                {pendingHref === item.href ? <span className={styles.navPendingText}>이동 중...</span> : null}
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.accountCard}>
            <Link
              href={mypageHref}
              prefetch={false}
              className={`${styles.accountProfileLink} ${
                isMypageActive ? styles.accountProfileLinkActive : ""
              } ${pendingHref === mypageHref ? styles.accountProfileLinkPending : ""}`}
              aria-current={isMypageActive ? "page" : undefined}
              aria-busy={pendingHref === mypageHref}
              onClick={() => {
                if (!isMypageActive) {
                  setPendingHref(mypageHref)
                }
              }}
            >
              <span className={styles.accountAvatar}>
                {logoImageUrl && !isLogoImageBroken ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoImageUrl}
                      alt={`${accountLabel} 로고`}
                      className={styles.accountAvatarImage}
                      onError={() => setIsLogoImageBroken(true)}
                    />
                  </>
                ) : (
                  <span aria-label="학원 프로필 이미지 자리" role="img">
                    {accountInitial}
                  </span>
                )}
              </span>
              <span className={styles.accountName}>{accountLabel}</span>
              <span className={styles.accountChevron} aria-hidden="true">
                {">"}
              </span>
            </Link>

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
