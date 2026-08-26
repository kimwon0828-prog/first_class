import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { resolveApplicationStatusDisplay } from "@/features/applications/lib/application-status-display"
import { getMyApplications } from "@/features/applications/queries/get-my-applications"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { getMyDashboard } from "@/features/my/queries/get-my-dashboard"
import { MyDashboardHome } from "@/features/my/ui/my-dashboard-home"
import type { TrialApplicationSummary } from "@/shared/lib/db/adapter"
import styles from "./page.module.css"
import { POC_DISCOVERY_HREF } from "@/shared/config/discovery"

export const dynamic = "force-dynamic"
export const revalidate = 0

const resolveNextUpcomingApplication = (items: TrialApplicationSummary[]) => {
  const now = new Date()

  return [...items]
    .filter((item) => {
      if (item.status !== "confirmed" || !item.confirmedSlotAt) {
        return false
      }

      const confirmedDate = new Date(item.confirmedSlotAt)
      if (Number.isNaN(confirmedDate.getTime()) || confirmedDate.getTime() <= now.getTime()) {
        return false
      }

      return (
        resolveApplicationStatusDisplay({
          status: item.status,
          scheduledAt: item.confirmedSlotAt,
          registrationStatus: item.registrationStatus,
          now
        }).group === "upcoming"
      )
    })
    .sort((left, right) => {
      return new Date(left.confirmedSlotAt ?? "").getTime() - new Date(right.confirmedSlotAt ?? "").getTime()
    })[0] ?? null
}

export default async function MyPage() {
  noStore()
  const profile = await requireParentAccess({ returnTo: "/my" })
  const [{ data, error }, { data: allApplications }] = await Promise.all([
    getMyDashboard(),
    getMyApplications()
  ])
  const nextUpcomingApplication = resolveNextUpcomingApplication(allApplications)

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.content}>
          {error ? (
            <section className={`${styles.card} ${styles.dangerCard}`}>
              <p className={styles.dangerText}>{error}</p>
              <Link href={POC_DISCOVERY_HREF} className={styles.link}>
                수업 찾으러 가기
              </Link>
            </section>
          ) : (
            <MyDashboardHome
              profileName={profile.name}
              profilePhone={profile.phone}
              dashboard={data}
              nextUpcomingApplication={nextUpcomingApplication}
            />
          )}
        </div>
      </div>

      <nav className={styles.bottomNav} aria-label="하단 탭">
        <Link href={POC_DISCOVERY_HREF} className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V10.5Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>홈</span>
        </Link>
        <Link href="/favorites" className={styles.navItem}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M7 4h10a1 1 0 0 1 1 1v17l-6-3.6L6 22V5a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
          <span>관심수업</span>
        </Link>
        <Link href="/my" className={`${styles.navItem} ${styles.navItemActive}`}>
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path
              d="M20 21a8 8 0 1 0-16 0"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>마이</span>
        </Link>
      </nav>
    </main>
  )
}
