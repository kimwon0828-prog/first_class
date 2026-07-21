"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import styles from "./page.module.css"

type ClassesBottomNavProps = {
  classesHomeHref: string
  myApplicationsEntryHref: string
}

const navPendingTextStyle = {
  fontSize: 11,
  lineHeight: "14px",
  color: "#2aad38",
  fontWeight: 700
} as const

export const ClassesBottomNav = ({
  classesHomeHref,
  myApplicationsEntryHref
}: ClassesBottomNavProps) => {
  const pathname = usePathname() ?? ""
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    setPendingHref(null)
  }, [pathname])

  const navItems = [
    {
      href: classesHomeHref,
      active: pathname === "/classes",
      label: "홈",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    },
    {
      href: "/favorites",
      active: pathname === "/favorites",
      label: "관심수업",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )
    },
    {
      href: myApplicationsEntryHref,
      active: pathname === "/my/applications" || pathname === "/my" || pathname === "/studio",
      label: "내 신청",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path
            d="M9 6h11M9 12h11M9 18h11M5 6h.01M5 12h.01M5 18h.01"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    }
  ] as const

  return (
    <nav className={styles.bottomNav} aria-label="하단 탭">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${styles.navItem} ${item.active ? styles.navItemActive : ""}`}
          aria-current={item.active ? "page" : undefined}
          aria-busy={pendingHref === item.href}
          onClick={() => {
            if (!item.active) {
              setPendingHref(item.href)
            }
          }}
        >
          {item.icon}
          <span>{pendingHref === item.href ? "이동 중..." : item.label}</span>
          {pendingHref === item.href ? <span style={navPendingTextStyle}>불러오는 중</span> : null}
        </Link>
      ))}
    </nav>
  )
}
