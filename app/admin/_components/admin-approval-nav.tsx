import Link from "next/link"

import styles from "./admin-approval-nav.module.css"

type AdminApprovalNavProps = {
  currentPath: "/admin/academy-approvals" | "/admin/academy-update-requests"
}

const tabs = [
  {
    href: "/admin/academy-approvals" as const,
    label: "신규 학원 승인"
  },
  {
    href: "/admin/academy-update-requests" as const,
    label: "정보수정 요청"
  }
]

export function AdminApprovalNav({ currentPath }: AdminApprovalNavProps) {
  return (
    <nav className={styles.nav} aria-label="관리자 승인 메뉴">
      <div className={styles.tabList}>
        {tabs.map((tab) => {
          const isActive = tab.href === currentPath

          return (
            <Link
              key={tab.href}
              href={tab.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              className={`${styles.tab} ${isActive ? styles.tabActive : ""}`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
