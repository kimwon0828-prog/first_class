"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { resolveParentNavTab } from "@/features/classes/lib/parent-nav"

import styles from "./parent-bottom-nav.module.css"

/**
 * 학부모 화면의 하단 탭. 모든 학부모 route 가 이 하나를 쓴다.
 *
 * 네 자리가 제품의 IA 다.
 *   홈       — 발견 · 검색 진입 · 지금 상황 요약
 *   일정     — 앞으로 예정된 체험수업 · 레벨테스트
 *   기록     — 끝난 경험 · 리포트 · 교육 프로필
 *   마이페이지 — 자녀 · 관심수업 · 프로필 · 설정
 *
 * ⚠️ /classes 는 탭이 아니다. Home 에서 시작하는 검색의 결과 화면이라
 *    거기서는 홈이 active 다. route 는 그대로 살아 있다.
 */
type ParentBottomNavProps = {
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

export const ParentBottomNav = ({
  scheduleHref = "/my/schedule",
  recordHref = "/record",
  myPageHref = "/my"
}: ParentBottomNavProps) => {
  const pathname = usePathname() ?? ""
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  const activeTab = resolveParentNavTab(pathname)

  const navItems = [
    { tab: "home", href: "/", label: "홈", icon: <HomeIcon /> },
    { tab: "schedule", href: scheduleHref, label: "일정", icon: <ScheduleIcon /> },
    { tab: "record", href: recordHref, label: "기록", icon: <RecordIcon /> },
    { tab: "my", href: myPageHref, label: "마이페이지", icon: <MyIcon /> }
  ] as const

  return (
    <nav className={styles.bottomNav} aria-label="하단 탭">
      {navItems.map((item) => {
        const isActive = activeTab === item.tab
        return (
          <Link
            key={item.tab}
            href={item.href}
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ""}`}
            aria-current={isActive ? "page" : undefined}
            aria-busy={pendingHref === item.href}
            onClick={() => {
              if (!isActive) {
                setPendingHref(item.href)
              }
            }}
          >
            {item.icon}
            <span className={styles.navLabel}>
              {pendingHref === item.href ? "이동 중" : item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
