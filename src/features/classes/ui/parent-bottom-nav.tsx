"use client"

import Link, { useLinkStatus } from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Suspense, type ReactNode } from "react"

import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"

import { withParentChild } from "../lib/parent-navigation"

import styles from "./parent-bottom-nav.module.css"
import { useParentLinkPrefetch } from "./use-parent-link-prefetch"
import { useParentNavVisibility } from "./use-parent-nav-visibility"

/**
 * 학부모 화면의 하단 탭. 모든 학부모 route 가 이 하나를 쓴다.
 *
 * 네 자리가 제품의 IA 다.
 *   홈       — 발견 · 검색 진입 · 지금 상황 요약
 *   일정     — 앞으로 예정된 체험수업 · 레벨테스트
 *   기록     — 끝난 경험 · 리포트 · 교육 프로필
 *   마이페이지 — 자녀 · 관심수업 · 프로필 · 설정
 *
 * 탐색/관심수업은 독립 화면이며 어느 탭도 active로 표시하지 않는다.
 */
type ParentBottomNavProps = {
  designVersion?: "v1"
  /** 로그인 상태에 따라 목적지가 달라지는 탭만 주소를 받는다. */
  scheduleHref?: string
  recordHref?: string
  myPageHref?: string
}

const HomeIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const ScheduleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.9" />
    <path d="M3.5 9.8h17" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
)

const RecordIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const MyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M20 21a8 8 0 1 0-16 0"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const BottomNav = ({
  designVersion,
  scheduleHref = "/my/schedule",
  recordHref = "/record",
  myPageHref = "/my",
  child = null
}: ParentBottomNavProps & { child?: string | null }) => {
  const pathname = usePathname() ?? ""
  const { hidden, keyboard } = useParentNavVisibility(pathname)

  const activeTab = resolveParentNavTab(pathname)

  const navItems = [
    { tab: "home", href: withParentChild("/", child), label: "홈", icon: <HomeIcon /> },
    { tab: "schedule", href: withParentChild(scheduleHref, child), label: "일정", icon: <ScheduleIcon /> },
    { tab: "record", href: withParentChild(recordHref, child), label: "기록", icon: <RecordIcon /> },
    { tab: "my", href: withParentChild(myPageHref, child), label: "마이페이지", icon: <MyIcon /> }
  ] as const

  return (
    <nav className={`${styles.bottomNav} ${designVersion === "v1" ? styles.v1 : ""}`} aria-label="하단 탭"
      data-hidden={hidden || undefined} data-keyboard={keyboard || undefined} aria-hidden={hidden || undefined} inert={hidden}>
      {navItems.map((item) => {
        const isActive = activeTab === item.tab
        return (
          <PreparedNavLink
            idle={pathname === "/" && item.tab !== "home"}
            key={item.tab}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
            aria-current={isActive ? "page" : undefined}
            onClick={(event) => {
              if (event.currentTarget.querySelector('[aria-busy="true"]') && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) event.preventDefault()
            }}
          >
            <NavContent icon={item.icon} label={item.label} />
          </PreparedNavLink>
        )
      })}
    </nav>
  )
}

function PreparedNavLink({ idle, ...props }: React.ComponentProps<typeof Link> & { idle: boolean; href: string }) {
  const { prefetch, prepare, cancel } = useParentLinkPrefetch(props.href, idle)
  return <Link {...props} prefetch={prefetch} onClick={event => { cancel(); props.onClick?.(event) }} onPointerEnter={prepare} onTouchStart={prepare} onFocus={prepare} />
}

function NavContent({ icon, label }: { icon: ReactNode; label: string }) {
  const { pending } = useLinkStatus()
  return <>
    <span className={styles.icon} aria-busy={pending}>{pending ? <span className={styles.spinner} aria-hidden="true" /> : icon}</span>
    <span className={styles.navLabel}>{label}</span>
  </>
}

function ContextualBottomNav(props: ParentBottomNavProps) {
  const params = useSearchParams()
  return <BottomNav {...props} child={params.get("child")} />
}
export function ParentBottomNav(props: ParentBottomNavProps) {
  return <Suspense fallback={<BottomNav {...props} />}><ContextualBottomNav {...props} /></Suspense>
}
