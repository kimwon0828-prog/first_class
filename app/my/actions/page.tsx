import type { Metadata } from "next"
import Link from "next/link"
import { unstable_noStore as noStore } from "next/cache"

import { formatParentActionSubject } from "@/features/actions/lib/parent-actions"
import { getParentActions } from "@/features/actions/queries/get-parent-actions"
import { ParentBottomNav } from "@/features/classes/ui/parent-bottom-nav"
import { requireParentAccess } from "@/features/my/lib/require-parent-access"

import styles from "./page.module.css"

/*
 * 지금 확인해야 할 것.
 *
 * ⚠️ 알림함이 아니다. 학부모가 실제로 해야 하는 일만 온다.
 *    "학원 확인 중" · "예약 확정됨" · "다가오는 수업" 은 Action 이 아니다 —
 *    일정은 /my/schedule 이 맡는다.
 *
 * ⚠️ 읽음/안읽음을 만들지 않는다. V1 의 판정은 두 사실뿐이다:
 *    살아 있는 발행본이 있다 AND 아직 ParentDecision 이 없다.
 */
export const metadata: Metadata = {
  title: "지금 확인해야 할 것 | 첫수업",
  description: "학원이 발행한 체험 리포트 중 아직 확인하지 않은 것을 모아서 보여드립니다.",
  alternates: {
    canonical: "/my/actions"
  }
}

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function ParentActionsPage() {
  noStore()
  // 다른 학부모 화면과 같은 정책이다. 비로그인은 returnTo 를 달고 돌아온다.
  await requireParentAccess({ returnTo: "/my/actions" })

  const { actions, error } = await getParentActions()

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <h1 className={styles.title}>지금 확인해야 할 것</h1>
          <p className={styles.subcopy}>학원이 발행한 리포트 중 아직 생각을 남기지 않은 체험이에요.</p>
        </header>

        <div className={styles.content}>
          {/* 조회 실패와 "할 일 없음" 은 다른 것이다. 실패를 없음으로 접지 않는다. */}
          {error ? (
            <section className={styles.stateCard}>
              <p className={styles.stateTitle}>{error}</p>
              <p className={styles.stateDesc}>잠시 후 다시 시도해 주세요.</p>
              <Link href="/my/actions" className={styles.retryLink}>
                다시 불러오기
              </Link>
            </section>
          ) : actions.length === 0 ? (
            <section className={styles.emptyState}>
              <p className={styles.emptyTitle}>지금 확인할 내용이 없어요.</p>
              {/* Action Center 는 발견 화면이 아니다. 수업 검색을 유도하지 않는다. */}
              <p className={styles.emptyDesc}>새로운 확인 사항이 생기면 여기에 보여드릴게요.</p>
            </section>
          ) : (
            <ul className={styles.actionList}>
              {actions.map((action) => (
                <li key={action.id}>
                  <Link href={action.href} className={styles.actionCard}>
                    <span className={styles.actionSubject}>{formatParentActionSubject(action)}</span>
                    <span className={styles.actionTitle}>{action.title}</span>
                    {action.academyName ? (
                      <span className={styles.actionAcademy}>{action.academyName}</span>
                    ) : null}
                    <span className={styles.actionCta}>
                      {action.ctaLabel}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M9 18l6-6-6-6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ParentBottomNav />
    </main>
  )
}
