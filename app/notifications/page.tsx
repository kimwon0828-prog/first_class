import type { Metadata } from "next"
import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"
import { groupNotificationsBySeoulDate } from "@/features/notifications/lib/parent-notifications"
import { getParentNotifications } from "@/features/notifications/queries/get-parent-notifications"

import styles from "./page.module.css"

/*
 * 알림함.
 *
 * ⚠️ /my/actions 와 역할이 다르다.
 *    /my/actions — 지금 내가 해야 하는 일. 끝나면 사라진다.
 *    /notifications — 최근 어떤 일이 있었는가. 끝나도 남는다.
 *
 * ⚠️ 읽음/안읽음이 없다. schema 에 read_at 이 없으므로
 *    빨간 점 · "안 읽은 N개" · 새 알림 배지를 만들지 않는다.
 *
 * ⚠️ 실제 timestamp 가 있는 event 만 들어온다. 없는 일은 알림이 되지 않는다.
 */
export const metadata: Metadata = {
  title: "알림 | 첫수업",
  description: "최근 첫수업 관련 변화와 안내를 다시 확인할 수 있습니다.",
  alternates: {
    canonical: "/notifications"
  }
}

export const dynamic = "force-dynamic"
export const revalidate = 0

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default async function ParentNotificationsPage() {
  noStore()
  // 다른 학부모 화면과 같은 정책이다. 비로그인은 returnTo 를 달고 돌아온다.
  const profile = await requireParentAccess({ returnTo: "/notifications" })

  /*
   * profile.id 는 auth.uid() 와 같은 값이다(profiles.id 가 auth.users(id) 를 참조한다).
   * application_logs.actor_id 도 profiles(id) 를 가리키므로, 이 값으로
   * "내가 만든 로그인가" 를 정확히 가릴 수 있다.
   */
  const { notifications, error } = await getParentNotifications(profile.id)
  const groups = groupNotificationsBySeoulDate(notifications)

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.backButton} aria-label="뒤로가기">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
          <h1 className={styles.title}>알림</h1>
          <span aria-hidden="true" />
        </header>

        <div className={styles.content}>
          {/* 조회 실패와 "알림 없음" 은 다른 것이다. 실패를 없음으로 접지 않는다. */}
          {error ? (
            <section className={styles.stateCard}>
              <p className={styles.stateTitle}>{error}</p>
              <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
              <Link href="/notifications" className={styles.retryLink}>
                다시 불러오기
              </Link>
            </section>
          ) : groups.length === 0 ? (
            <section className={styles.emptyState}>
              <p className={styles.emptyTitle}>아직 받은 알림이 없어요.</p>
              {/* 알림함은 둘러보는 자리가 아니다. CTA 를 두지 않는다. */}
              <p className={styles.emptyDesc}>
                첫수업과 관련된 새로운 소식이 생기면 여기에 보여드릴게요.
              </p>
            </section>
          ) : (
            groups.map((group) => (
              <section key={group.dateKey} className={styles.group} aria-label={group.dateLabel}>
                <h2 className={styles.groupDate}>{group.dateLabel}</h2>
                <ul className={styles.list}>
                  {group.items.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className={styles.item}>
                        <span className={styles.itemBody}>
                          <span className={styles.itemTitle}>{item.title}</span>
                          {/* 아이 이름과 수업명은 실제로 적혀 있을 때만 나온다. */}
                          {item.childName || item.contextLabel ? (
                            <span className={styles.itemMeta}>
                              {[item.childName, item.contextLabel].filter(Boolean).join(" · ")}
                            </span>
                          ) : null}
                        </span>
                        <span className={styles.itemAction}>
                          확인하기
                          <ChevronIcon />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>

      <ParentBottomNav />
    </main>
  )
}
