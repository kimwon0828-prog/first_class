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
  /** 본문 하단 footer. 서버에서 만들어 넘긴다(연도 계산이 hydration 을 타지 않게). */
  footer?: ReactNode
}

type NavItem = {
  href: string
  label: string
  icon: (props: { className?: string }) => ReactNode
}

/*
 * 이 저장소에는 icon 패키지가 없다. 다른 화면과 같은 방식(inline SVG,
 * viewBox 24, stroke=currentColor, strokeWidth 2, round cap/join)으로 그린다.
 * 색은 CSS 가 정한다. 아이콘별 색을 지정하지 않는다.
 */
const NavIcon = ({ className, children }: { className?: string; children: ReactNode }) => (
  <svg
    className={className}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

const DashboardIcon = ({ className }: { className?: string }) => (
  <NavIcon className={className}>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </NavIcon>
)

const CasesIcon = ({ className }: { className?: string }) => (
  <NavIcon className={className}>
    <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
    <path d="M16 5h2a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2" />
    <path d="M9 11h6" />
    <path d="M9 15h4" />
  </NavIcon>
)

const ClassesIcon = ({ className }: { className?: string }) => (
  <NavIcon className={className}>
    <path d="M12 7v13" />
    <path d="M12 7a4 4 0 0 0-4-3H3v13h5a4 4 0 0 1 4 3" />
    <path d="M12 7a4 4 0 0 1 4-3h5v13h-5a4 4 0 0 0-4 3" />
  </NavIcon>
)

const ScheduleIcon = ({ className }: { className?: string }) => (
  <NavIcon className={className}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
  </NavIcon>
)

const TeachersIcon = ({ className }: { className?: string }) => (
  <NavIcon className={className}>
    <path d="M15 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1" />
    <circle cx="8.5" cy="8" r="3.5" />
    <path d="M22 20v-1a4 4 0 0 0-3-3.87" />
    <path d="M16 4.13a4 4 0 0 1 0 7.75" />
  </NavIcon>
)

/**
 * 메뉴에서 감췄지만 아직 살아 있는 legacy 경로를 어떤 메뉴로 접어 보여줄지 한 곳에서 관리한다.
 * redirect 는 하지 않는다. 직접 URL 로 들어와도 사이드바가 현재 위치를 잃지 않게 하는 용도다.
 *
 * /studio/applications/[id] 는 Case 상세이므로 prefix 매칭으로 함께 잡힌다.
 */
const NAV_ALIAS_PATHS: Record<string, readonly string[]> = {
  "/studio/cases": ["/studio/applications", "/studio/unregistered"]
}

const matchesPath = (pathname: string, href: string) => {
  if (href === "/studio") {
    return pathname === "/studio"
  }

  return pathname === href || pathname.startsWith(`${href}/`)
}

const isActivePath = (pathname: string, href: string) => {
  if (matchesPath(pathname, href)) {
    return true
  }

  return (NAV_ALIAS_PATHS[href] ?? []).some((alias) => matchesPath(pathname, alias))
}

export const StudioShell = ({ children, organizationName, logoImagePath, footer }: StudioShellProps) => {
  const pathname = usePathname() ?? ""
  const accountLabel = organizationName?.trim() || "학원"
  const accountInitial = accountLabel.slice(0, 1)
  const mypageHref = "/studio/mypage"
  const isMypageActive = isActivePath(pathname, mypageHref)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  // 사이드바 링크는 항상 viewport 안에 있어서 자동 prefetch 를 켜면 Studio dynamic route 6~7 개가
  // 첫 렌더 직후 한꺼번에 요청된다. hover/focus 로 의도를 보인 href 만 prefetch 를 허용한다.
  const [intentHrefs, setIntentHrefs] = useState<ReadonlySet<string>>(() => new Set<string>())
  const markPrefetchIntent = (href: string) =>
    setIntentHrefs((current) => (current.has(href) ? current : new Set(current).add(href)))
  // dynamic route 는 prefetch={true} 여야 loading boundary 너머의 payload 까지 prefetch 된다.
  // (auto/null 은 loading.tsx 까지만 가져와서 click 시 destination RSC 를 다시 요청한다.)
  const prefetchFor = (href: string) => (intentHrefs.has(href) ? true : false)
  const [isLogoImageBroken, setIsLogoImageBroken] = useState(false)
  // 신청 관리(/studio/applications)와 상담 관리(/studio/unregistered)는 상담·등록으로 합쳤다.
  // 두 route 는 롤백/기능 비교를 위해 살아 있고, 메뉴에서만 감춘다(NAV_ALIAS_PATHS 참고).
  const navItems: NavItem[] = [
    { href: "/studio", label: "대시보드", icon: DashboardIcon },
    { href: "/studio/cases", label: "상담·등록", icon: CasesIcon },
    { href: "/studio/classes", label: "수업 관리", icon: ClassesIcon },
    { href: "/studio/schedule", label: "일정 관리", icon: ScheduleIcon },
    { href: "/studio/teachers", label: "선생님 관리", icon: TeachersIcon }
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
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={prefetchFor(item.href)}
                className={`${styles.navItem} ${active ? styles.navItemActive : ""} ${
                  pendingHref === item.href ? styles.navItemPending : ""
                }`}
                aria-current={active ? "page" : undefined}
                aria-busy={pendingHref === item.href}
                onMouseEnter={() => markPrefetchIntent(item.href)}
                onFocus={() => markPrefetchIntent(item.href)}
                onClick={() => {
                  if (!active) {
                    setPendingHref(item.href)
                  }
                }}
              >
                <Icon className={styles.navIcon} />
                <span className={styles.navLabel}>{item.label}</span>
                {pendingHref === item.href ? <span className={styles.navPendingText}>이동 중...</span> : null}
              </Link>
            )
          })}
        </nav>

        <div className={styles.sidebarBottom}>
          <div className={styles.accountCard}>
            <Link
              href={mypageHref}
              prefetch={prefetchFor(mypageHref)}
              className={`${styles.accountProfileLink} ${
                isMypageActive ? styles.accountProfileLinkActive : ""
              } ${pendingHref === mypageHref ? styles.accountProfileLinkPending : ""}`}
              aria-current={isMypageActive ? "page" : undefined}
              aria-busy={pendingHref === mypageHref}
              onMouseEnter={() => markPrefetchIntent(mypageHref)}
              onFocus={() => markPrefetchIntent(mypageHref)}
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
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <main className={styles.content}>{children}</main>
        {footer}
      </div>
    </div>
  )
}
