"use client"

import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import { useEffect, useMemo, useState } from "react"

import { getSupabaseBrowserClient } from "@/integrations/supabase/client"
import {
  STUDIO_PRIMARY_NAV,
  STUDIO_SETTINGS_NAV,
  isStudioNavActive,
  type StudioNavEntry,
  type StudioNavKey
} from "@/features/studio/lib/studio-nav"
import type { StudioSidebarPlan } from "@/features/studio/lib/studio-sidebar-plan"
import { StudioHomeLogo } from "@/features/studio/ui/studio-home-logo"
import {
  useStudioInternalPathname,
  useStudioNavigationPathFactory
} from "@/features/studio/ui/studio-navigation-provider"
import { V2Avatar } from "@/features/studio/ui/v2/v2-avatar"
import {
  V2CalendarIcon,
  V2ChartIcon,
  V2ChevronDownIcon,
  V2GearIcon,
  V2HelpIcon,
  V2HomeIcon,
  V2InboxIcon,
  V2StudentsIcon
} from "@/features/studio/ui/v2/v2-icons"
import { COMPANY_EMAIL_HREF } from "@/shared/config/company-info"
import styles from "./studio-shell.module.css"

const PROFILE_ASSET_BUCKET = "academy-profile-assets"

type StudioShellProps = {
  children: ReactNode
  organizationName?: string | null
  logoImagePath?: string | null
  /** 사이드바 하단 플랜 카드. null 이면(조회 실패) 카드를 그리지 않는다. */
  plan?: StudioSidebarPlan | null
  /** 메뉴 옆 건수. 0 · null 이면 그리지 않는다. */
  navCounts?: Partial<Record<StudioNavKey, number | null>>
  /** 본문 하단 footer. 서버에서 만들어 넘긴다(연도 계산이 hydration 을 타지 않게). */
  footer?: ReactNode
  /** 상단 안내(§5.25, 자동 체험 종료 14일 전부터). null 이면 그리지 않는다. */
  trialBanner?: { message: string } | null
}

const NAV_ICONS: Record<StudioNavKey, (props: { className?: string }) => ReactNode> = {
  home: V2HomeIcon,
  cases: V2InboxIcon,
  students: V2StudentsIcon,
  classes: V2CalendarIcon,
  analytics: V2ChartIcon,
  settings: V2GearIcon
}

/* 메뉴 건수 배지를 화면 읽기로 풀어 말할 때 쓰는 이름. */
const NAV_COUNT_LABELS: Partial<Record<StudioNavKey, string>> = {
  home: "오늘 할 일",
  cases: "일정 확정이 필요한 신청"
}

const MYPAGE_HREF = "/studio/mypage"

/**
 * Studio v2 사이드바 (Figma "Studio v2/Sidebar", 기준 화면 2148:6043 · 2148:6939).
 *
 * 위: 로고 + 파트너 · 학원 카드 · 메뉴(홈 / 신청 / 수업·일정 / 분석)
 * 아래: 현재 플랜 · 도움말·문의 · 설정
 *
 * 메뉴 묶음과 활성 판정은 studio-nav.ts 한 곳에서 정한다. URL 은 바꾸지 않았다.
 */
export const StudioShell = ({ children, organizationName, logoImagePath, plan, navCounts, footer, trialBanner }: StudioShellProps) => {
  /* 링크는 host 에 맞춰 나가고, 위치 비교는 내부 경로로 한다. */
  const studioPath = useStudioNavigationPathFactory()
  const pathname = useStudioInternalPathname()
  const academyName = organizationName?.trim() || "학원"
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  // 사이드바 링크는 항상 viewport 안에 있어서 자동 prefetch 를 켜면 Studio dynamic route 여러 개가
  // 첫 렌더 직후 한꺼번에 요청된다. hover/focus 로 의도를 보인 href 만 prefetch 를 허용한다.
  const [intentHrefs, setIntentHrefs] = useState<ReadonlySet<string>>(() => new Set<string>())
  const markPrefetchIntent = (href: string) =>
    setIntentHrefs((current) => (current.has(href) ? current : new Set(current).add(href)))
  // dynamic route 는 prefetch={true} 여야 loading boundary 너머의 payload 까지 prefetch 된다.
  // (auto/null 은 loading.tsx 까지만 가져와서 click 시 destination RSC 를 다시 요청한다.)
  const prefetchFor = (href: string) => (intentHrefs.has(href) ? true : false)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  const logoImageUrl = useMemo(() => {
    if (!logoImagePath) {
      return null
    }

    const {
      data: { publicUrl }
    } = getSupabaseBrowserClient().storage.from(PROFILE_ASSET_BUCKET).getPublicUrl(logoImagePath)

    return publicUrl || null
  }, [logoImagePath])

  /** 내부 이동 링크 공통 속성. 활성 · 이동 중 표시와 prefetch 의도를 한곳에서 붙인다. */
  const navLinkProps = (href: string, active: boolean) => ({
    href: studioPath(href),
    prefetch: prefetchFor(href),
    "aria-current": active ? ("page" as const) : undefined,
    "aria-busy": pendingHref === href,
    onMouseEnter: () => markPrefetchIntent(href),
    onFocus: () => markPrefetchIntent(href),
    onClick: () => {
      if (!active) {
        setPendingHref(href)
      }
    }
  })

  const renderNavItem = (entry: StudioNavEntry) => {
    const active = isStudioNavActive(pathname, entry)
    const Icon = NAV_ICONS[entry.key]
    const count = navCounts?.[entry.key] ?? null
    return (
      <Link
        key={entry.key}
        {...navLinkProps(entry.href, active)}
        className={[
          styles.navItem,
          active ? styles.navItemActive : null,
          pendingHref === entry.href ? styles.navItemPending : null
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <Icon className={styles.navIcon} />
        <span className={styles.navLabel}>{entry.label}</span>
        {pendingHref === entry.href ? <span className={styles.navPendingText}>이동 중...</span> : null}
        {count ? (
          <>
            <span className={styles.navCount} aria-hidden="true">
              {count}
            </span>
            <span className={styles.srOnly}>{NAV_COUNT_LABELS[entry.key] ? `, ${NAV_COUNT_LABELS[entry.key]} ${count}건` : `, ${count}건`}</span>
          </>
        ) : null}
      </Link>
    )
  }

  const isMypageActive = pathname === MYPAGE_HREF

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="Studio 메뉴">
        <div className={styles.brand}>
          <StudioHomeLogo className={styles.logoLink} logoClassName={styles.logoImage} width={76} height={25} />
          <span className={styles.partnerBadge}>파트너</span>
        </div>

        {/* 학원 카드 → 내 계정(기존 마이페이지). 이전 사이드바 하단 계정 카드와 같은 목적지다. */}
        <Link
          {...navLinkProps(MYPAGE_HREF, isMypageActive)}
          className={[styles.academyCard, pendingHref === MYPAGE_HREF ? styles.navItemPending : null]
            .filter(Boolean)
            .join(" ")}
        >
          <V2Avatar name={academyName} imageUrl={logoImageUrl} imageAlt={`${academyName} 로고`} />
          <span className={styles.academyText}>
            {/* 이름이 길면 CSS 로 잘린다. 잘린 뒤에도 전체 이름을 볼 수 있게 title 을 둔다. */}
            <span className={styles.academyName} title={academyName}>
              {academyName}
            </span>
            <span className={styles.academyRole}>원장 · 관리자</span>
          </span>
          <V2ChevronDownIcon className={styles.academyChevron} size={16} />
        </Link>

        <nav className={styles.nav} aria-label="주 메뉴">
          {STUDIO_PRIMARY_NAV.map(renderNavItem)}
        </nav>

        <div className={styles.bottom}>
          {plan ? (
            <Link {...navLinkProps("/studio/billing", false)} className={styles.planCard}>
              <span className={styles.planHead}>
                <span className={styles.planLabel}>{plan.label}</span>
                {plan.trial ? <span className={styles.planDays}>{plan.trial.daysLeft}일 남음</span> : null}
              </span>
              {plan.trial && plan.trial.elapsedRatio !== null ? (
                <span className={styles.planBar} aria-hidden="true">
                  <span
                    className={styles.planBarFill}
                    style={{ "--plan-elapsed": `${Math.round(plan.trial.elapsedRatio * 100)}%` } as CSSProperties}
                  />
                </span>
              ) : null}
            </Link>
          ) : null}

          <nav className={styles.nav} aria-label="보조 메뉴">
            <a href={COMPANY_EMAIL_HREF} className={styles.navItem}>
              <V2HelpIcon className={styles.navIcon} />
              <span className={styles.navLabel}>도움말·문의</span>
            </a>
            {renderNavItem(STUDIO_SETTINGS_NAV)}
          </nav>
        </div>
      </aside>

      <div className={styles.main}>
        <main className={styles.content}>
          {/* 플랜·결제에서는 같은 내용이 지금 상태 카드에 있으므로 띄우지 않는다. */}
          {trialBanner && !pathname.startsWith("/studio/billing") ? (
            <div className={styles.trialBanner}>
              <p className={styles.trialBannerBox} role="status">
                <span>{trialBanner.message}</span>
                <Link href={studioPath("/studio/billing")} prefetch={false} className={styles.trialBannerLink}>
                  플랜·결제 보기
                </Link>
              </p>
            </div>
          ) : null}
          {children}
        </main>
        {footer}
      </div>
    </div>
  )
}
