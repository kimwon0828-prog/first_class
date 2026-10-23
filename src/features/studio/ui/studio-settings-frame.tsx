"use client"

import Link from "next/link"
import type { ReactNode } from "react"

import { STUDIO_SETTINGS_TABS, getActiveStudioSettingsTab } from "@/features/studio/lib/studio-nav"
import {
  useStudioInternalPathname,
  useStudioNavigationPathFactory
} from "@/features/studio/ui/studio-navigation-provider"
import styles from "./studio-settings-frame.module.css"

/**
 * 설정 탭 틀. 학원 정보 · 선생님 · 플랜·결제 · 내 계정 화면이 각자의 layout 에서 이 틀을 쓴다.
 *
 * 권한은 여기서 판단하지 않는다. 각 page 가 그대로 requireTeacherStudioAccess 를 부른다.
 */
export const StudioSettingsFrame = ({ children }: { children: ReactNode }) => {
  const studioPath = useStudioNavigationPathFactory()
  const pathname = useStudioInternalPathname()
  const activeTab = getActiveStudioSettingsTab(pathname)

  return (
    <div className={styles.frame}>
      <h1 className={styles.title}>설정</h1>
      <div className={styles.body}>
        <nav className={styles.tabs} aria-label="설정 메뉴">
          {STUDIO_SETTINGS_TABS.map((tab) => {
            const active = tab.key === activeTab
            return (
              <Link
                key={tab.key}
                href={studioPath(tab.href)}
                prefetch={false}
                aria-current={active ? "page" : undefined}
                className={active ? `${styles.tab} ${styles.tabActive}` : styles.tab}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  )
}
